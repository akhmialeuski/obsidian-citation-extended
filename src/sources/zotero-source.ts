import {
  DataSource,
  DataSourceLoadOptions,
  DataSourceLoadResult,
} from '../data-source';
import {
  WORKER_TASK_KINDS,
  convertToEntries,
  normalizeZoteroAttachments,
  ZoteroAbortError,
} from '../core';
import type {
  DatabaseType,
  Entry,
  ParseErrorInfo,
  ParseWorkerResponse,
} from '../core';
import type { ZoteroConnectorClient } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import { WorkerManager } from '../util';
import {
  createLinkedAbortController,
  PeriodicSync,
  readVersionedJsonCache,
  writeVersionedJsonCache,
} from './source-utils';

/**
 * Versioned on-disk cache: the raw export body plus the format it was fetched
 * in. Lets Obsidian keep serving the library when Zotero is closed, and lets a
 * later format change be detected (a stale-format cache is simply ignored).
 *
 * The optional `attachments` payload (raw `item.attachments` responses per
 * citekey) lets annotations survive offline loads. It is written as an OPTIONAL
 * field on a `version: 1` cache — a superset a rolled-back build (which accepts
 * only version 1 and ignores unknown fields) can still read. `version: 2` is
 * still accepted on read for forward tolerance.
 */
interface ZoteroCacheStateV2 {
  version: 1 | 2;
  format: DatabaseType;
  raw: string;
  /** Citekey → raw BBT `item.attachments` result. Absent when not fetched. */
  attachments?: Record<string, unknown[]>;
}

function isZoteroCacheState(parsed: unknown): parsed is ZoteroCacheStateV2 {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    ((parsed as { version?: unknown }).version === 1 ||
      (parsed as { version?: unknown }).version === 2) &&
    typeof (parsed as { raw?: unknown }).raw === 'string' &&
    typeof (parsed as { format?: unknown }).format === 'string'
  );
}

/**
 * Data source that loads bibliography entries directly from a locally running
 * Zotero via the Better BibTeX pull-export endpoint — no manual file export
 * required. The raw export (Better CSL JSON or BibLaTeX) is parsed through the
 * same worker pipeline as file-based sources:
 *
 *   pull export text -> Worker (loadEntries) -> EntryData[] -> convertToEntries
 *
 * When the export is configured to include notes, Zotero child notes come
 * through in the `note` field and surface via `{{note}}`.
 *
 * **PDF annotations:** when enabled, the source additionally fetches native
 * Zotero PDF annotations for every entry via batched Better BibTeX JSON-RPC
 * `item.attachments` calls, and attaches them as `entry.annotations` /
 * `entry.attachments` for templates. Annotation fetching is best-effort: a
 * failure degrades to a load warning, never a failed load, and the previously
 * cached payload is preserved rather than clobbered. To bound cost, a periodic
 * load whose export is byte-identical to the cache reuses the cached
 * attachments; because an annotation edit does not change the export body, a
 * `fullRefresh` load (the manual "Refresh citation database" command) always
 * re-fetches so new highlights are picked up on demand.
 *
 * **Offline cache:** the last successful export (and annotation payload) is
 * cached on disk. If Zotero is not reachable on a later load, the cache is
 * used so the library stays usable.
 *
 * **Periodic sync:** because there is no file to watch, the source optionally
 * polls on a configurable interval (chained setTimeout, re-reading the provider
 * each cycle so settings changes apply without recreating the source).
 */
export class ZoteroSource implements DataSource {
  private abortController: AbortController | null = null;
  private readonly poller: PeriodicSync | null;

  constructor(
    public readonly id: string,
    private client: ZoteroConnectorClient,
    private loadWorker: WorkerManager,
    private format: DatabaseType,
    private exportNotes: boolean,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    /** Current periodic-sync interval in ms (0 = disabled); read each cycle. */
    syncIntervalProvider?: () => number,
    /** Fetch native PDF annotations and attach them to entries. */
    private importAnnotations = false,
    /**
     * Pre-upgrade cache path (keyed by the old volatile source key). Read as a
     * fallback so an existing install's offline cache is not orphaned when the
     * cache filename scheme changes to the stable database id.
     */
    private legacyCachePath?: string,
  ) {
    this.poller = syncIntervalProvider
      ? new PeriodicSync(syncIntervalProvider, 'ZoteroSource')
      : null;
  }

  async load(
    externalSignal?: AbortSignal,
    options?: DataSourceLoadOptions,
  ): Promise<DataSourceLoadResult> {
    this.abortController?.abort();
    const controller = createLinkedAbortController(externalSignal);
    this.abortController = controller;
    const signal = controller.signal;

    try {
      let raw: string;
      try {
        raw = await this.client.fetchBibliography({
          exportNotes: this.exportNotes,
          signal,
        });
      } catch (error) {
        // A cancelled load is not a failure — let the caller's abort logic run.
        if (error instanceof ZoteroAbortError || signal.aborted) {
          throw error;
        }
        // Zotero unreachable: fall back to the offline cache if present.
        const cached = await this.readCache();
        if (cached) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `ZoteroSource: Zotero unavailable, using cached export (${message})`,
          );
          const result = await this.parseRaw(
            cached.raw,
            cached.format,
            [
              {
                message: `Zotero unavailable (using cache): ${message}`,
              },
            ],
            signal,
          );
          if (this.importAnnotations && cached.attachments) {
            ZoteroSource.attachAnnotations(result.entries, cached.attachments);
          }
          return result;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load from Zotero: ${message}`);
      }

      // Parse the fresh export. If the worker throws on a good export, still
      // persist the raw export (carrying any prior attachments forward) so a
      // later offline load serves the newest export rather than an older one.
      let result: DataSourceLoadResult;
      try {
        result = await this.parseRaw(raw, this.format, [], signal);
      } catch (parseError) {
        const prior = this.importAnnotations ? await this.readCache() : null;
        await this.writeCache(raw, prior?.attachments);
        throw parseError;
      }

      // Annotation enrichment is best-effort: a failure downgrades to a load
      // warning so the bibliography itself stays usable.
      let attachments: Record<string, unknown[]> | undefined;
      // True when the on-disk cache already holds this exact raw + attachments,
      // so rewriting it would be a redundant full-file write every poll cycle.
      let attachmentsUnchanged = false;
      if (this.importAnnotations) {
        // Only read the cache when it can actually be reused. A PDF-annotation
        // edit does NOT change the export body, so the manual "Refresh citation
        // database" (fullRefresh) must always re-fetch; skip the potentially
        // multi-MB cache read+parse on that path entirely.
        const cachedWithOrigin = options?.fullRefresh
          ? null
          : await this.readCacheWithOrigin();
        const cached = cachedWithOrigin?.state ?? null;
        // When the export is byte-identical to the cached one the bibliography
        // did not change, so reuse the cached attachment payloads instead of
        // re-fetching every entry's attachments on every periodic load.
        const reusableAttachments =
          cached?.raw === raw && cached?.format === this.format
            ? cached.attachments
            : undefined;
        if (reusableAttachments) {
          attachments = reusableAttachments;
          // Skip the redundant rewrite only when the PRIMARY (stable-id) cache
          // already holds this content. A hit from the legacy fallback path is
          // written once below so the cache migrates to the stable-id filename;
          // subsequent loads then hit the primary path and skip the write.
          attachmentsUnchanged = cachedWithOrigin?.fromPrimary === true;
          ZoteroSource.attachAnnotations(result.entries, reusableAttachments);
        } else {
          try {
            attachments = await this.fetchAttachments(result.entries, signal);
            ZoteroSource.attachAnnotations(result.entries, attachments);
          } catch (error) {
            if (error instanceof ZoteroAbortError || signal.aborted) {
              throw error;
            }
            const message =
              error instanceof Error ? error.message : String(error);
            console.warn(`ZoteroSource: annotation fetch failed (${message})`);
            result.parseErrors = [
              ...(result.parseErrors ?? []),
              { message: `PDF annotations unavailable: ${message}` },
            ];
            // Carry the last good attachment payload forward so writeCache does
            // not clobber it with nothing — a later offline load then still has
            // annotations for the (unchanged) citekeys instead of an empty set.
            // Read lazily here since we skip the reuse read on a fullRefresh.
            const prior = cached ?? (await this.readCache());
            attachments = prior?.attachments;
          }
        }
      }

      // Persist the successful export (and annotations) for offline use, unless
      // the cache already holds exactly this content.
      if (!attachmentsUnchanged) {
        await this.writeCache(raw, attachments);
      }

      return result;
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  /** Fetch raw attachments for all entries via batched JSON-RPC. */
  private async fetchAttachments(
    entries: Entry[],
    signal: AbortSignal,
  ): Promise<Record<string, unknown[]>> {
    const citekeys = entries.map((e) => e.id);
    const { attachmentsByCitekey, errors } =
      await this.client.fetchAttachmentsForCitekeys(citekeys, { signal });
    if (errors.length > 0) {
      console.debug(
        `ZoteroSource: ${errors.length} citekey(s) had no resolvable attachments`,
        errors.slice(0, 5),
      );
    }
    return Object.fromEntries(attachmentsByCitekey);
  }

  /** Normalize raw attachment payloads and attach them to matching entries. */
  private static attachAnnotations(
    entries: Entry[],
    attachmentsByCitekey: Record<string, unknown[]>,
  ): void {
    for (const entry of entries) {
      const raw = attachmentsByCitekey[entry.id];
      if (!raw) continue;
      const { attachments, annotations } = normalizeZoteroAttachments(raw);
      if (attachments.length > 0 || annotations.length > 0) {
        // Inject through the uniform Entry interface — the source is the only
        // place that knows these came from a BBT call; consumers just read
        // entry.annotations.
        entry.setAnnotations(annotations, attachments);
      }
    }
  }

  /** Parse a raw export body through the worker pipeline into typed entries. */
  private async parseRaw(
    raw: string,
    format: DatabaseType,
    priorErrors: ParseErrorInfo[],
    signal?: AbortSignal,
  ): Promise<DataSourceLoadResult> {
    const result: ParseWorkerResponse = await this.loadWorker.post(
      {
        kind: WORKER_TASK_KINDS.Parse,
        databaseRaw: raw,
        databaseType: format,
      },
      signal,
    );

    const entries = convertToEntries(format, result.entries);

    return {
      sourceId: this.id,
      entries,
      modifiedAt: new Date(),
      parseErrors: [...priorErrors, ...result.parseErrors],
    };
  }

  /**
   * Read and validate the cache, or null when missing/corrupt/stale. Falls
   * back to the pre-upgrade path so an existing install's offline cache is not
   * orphaned by the cache-filename scheme change.
   */
  private async readCache(): Promise<ZoteroCacheStateV2 | null> {
    return (await this.readCacheWithOrigin())?.state ?? null;
  }

  /**
   * Like {@link readCache} but reports whether the hit came from the primary
   * (stable-id) path or the legacy fallback, so the caller can migrate a
   * legacy-path cache to the stable-id filename on the next successful write.
   */
  private async readCacheWithOrigin(): Promise<{
    state: ZoteroCacheStateV2;
    fromPrimary: boolean;
  } | null> {
    const primary = await this.readCacheFrom(this.cachePath);
    if (primary) return { state: primary, fromPrimary: true };
    if (this.legacyCachePath && this.legacyCachePath !== this.cachePath) {
      const legacy = await this.readCacheFrom(this.legacyCachePath);
      if (legacy) return { state: legacy, fromPrimary: false };
    }
    return null;
  }

  /** Read+validate a single cache file, or null when missing/corrupt/stale. */
  private readCacheFrom(path?: string): Promise<ZoteroCacheStateV2 | null> {
    return readVersionedJsonCache(this.fileSystem, path, isZoteroCacheState);
  }

  /** Write the raw export to the cache file (best-effort, errors are silent). */
  private writeCache(
    raw: string,
    attachments?: Record<string, unknown[]>,
  ): Promise<void> {
    return writeVersionedJsonCache(this.fileSystem, this.cachePath, {
      // Keep version 1: the annotations payload is an OPTIONAL superset, so
      // a rolled-back build (which accepts only version === 1 and ignores
      // unknown fields) can still read this cache for its offline fallback.
      version: 1,
      format: this.format,
      raw,
      ...(attachments ? { attachments } : {}),
    } satisfies ZoteroCacheStateV2);
  }

  watch(callback: () => void): void {
    this.poller?.start(callback);
  }

  dispose(): void {
    this.poller?.stop();
    this.abortController?.abort();
    this.abortController = null;
  }
}
