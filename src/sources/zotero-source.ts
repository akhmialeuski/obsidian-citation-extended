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
import { createLinkedAbortController, PeriodicSync } from './source-utils';

/**
 * Versioned on-disk cache: the raw export body plus the format it was fetched
 * in. Lets Obsidian keep serving the library when Zotero is closed, and lets a
 * later format change be detected (a stale-format cache is simply ignored).
 *
 * V2 adds the raw `item.attachments` responses (per citekey) so annotations
 * survive offline loads. A V1 cache is still accepted — it simply carries no
 * annotations.
 */
interface ZoteroCacheStateV2 {
  version: 1 | 2;
  format: DatabaseType;
  raw: string;
  /** Citekey → raw BBT `item.attachments` result. Absent in V1 caches. */
  attachments?: Record<string, unknown[]>;
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
 * failure degrades to a load warning, never a failed load.
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
  ) {
    this.poller = syncIntervalProvider
      ? new PeriodicSync(syncIntervalProvider, 'ZoteroSource')
      : null;
  }

  async load(
    externalSignal?: AbortSignal,
    _options?: DataSourceLoadOptions,
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

      const result = await this.parseRaw(raw, this.format, [], signal);

      // Annotation enrichment is best-effort: a failure downgrades to a load
      // warning so the bibliography itself stays usable.
      let attachments: Record<string, unknown[]> | undefined;
      if (this.importAnnotations) {
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
        }
      }

      // Persist the successful export (and annotations) for offline use.
      await this.writeCache(raw, attachments);

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

  /** Read and validate the cache file, or null when missing/corrupt/stale. */
  private async readCache(): Promise<ZoteroCacheStateV2 | null> {
    if (!this.fileSystem || !this.cachePath) return null;
    try {
      if (!(await this.fileSystem.exists(this.cachePath))) return null;
      const parsed: unknown = JSON.parse(
        await this.fileSystem.readFile(this.cachePath),
      );
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        ((parsed as { version?: unknown }).version === 1 ||
          (parsed as { version?: unknown }).version === 2) &&
        typeof (parsed as { raw?: unknown }).raw === 'string' &&
        typeof (parsed as { format?: unknown }).format === 'string'
      ) {
        return parsed as ZoteroCacheStateV2;
      }
    } catch {
      // Missing or corrupt cache behaves exactly like no cache.
    }
    return null;
  }

  /** Write the raw export to the cache file (best-effort, errors are silent). */
  private async writeCache(
    raw: string,
    attachments?: Record<string, unknown[]>,
  ): Promise<void> {
    if (!this.fileSystem || !this.cachePath) return;
    try {
      await this.fileSystem.writeFile(
        this.cachePath,
        JSON.stringify({
          version: 2,
          format: this.format,
          raw,
          ...(attachments ? { attachments } : {}),
        } satisfies ZoteroCacheStateV2),
      );
    } catch {
      // Cache write failure is not critical.
    }
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
