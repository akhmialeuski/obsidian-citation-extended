import {
  DataSource,
  DataSourceLoadOptions,
  DataSourceLoadResult,
} from '../data-source';
import {
  DATABASE_FORMATS,
  convertToEntries,
  buildZoteroApiEntries,
  ZoteroAbortError,
} from '../core';
import type { ParseErrorInfo, ZoteroApiEntryData } from '../core';
import type { ZoteroLocalApiClient, ZoteroApiScope } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import {
  createLinkedAbortController,
  PeriodicSync,
  readVersionedJsonCache,
  writeVersionedJsonCache,
} from './source-utils';

/** Versioned on-disk cache of the last successful fetch. */
interface ZoteroApiCacheStateV1 {
  version: 1;
  /** Pre-built entry DTOs (the same shape the adapter consumes). */
  entries: ZoteroApiEntryData[];
  /** Zotero library version at fetch time, or null. */
  libraryVersion: number | null;
}

function isZoteroApiCacheState(
  parsed: unknown,
): parsed is ZoteroApiCacheStateV1 {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    (parsed as { version?: unknown }).version === 1 &&
    Array.isArray((parsed as { entries?: unknown }).entries)
  );
}

/**
 * Data source backed by the **native Zotero local API** (Zotero 7+) — no
 * Better BibTeX required. Items are fetched from the local HTTP server
 * (`http://127.0.0.1:23119/api/`), converted to self-contained entry DTOs
 * (citekey resolution, CSL payload, attachment file synthesis, collection
 * names), and wrapped in adapters:
 *
 *   local API JSON -> buildZoteroApiEntries -> convertToEntries('zotero-api')
 *
 * Citekeys resolve from the native `citationKey` field (Zotero 7.0.31+),
 * a legacy `Citation Key:` line in Extra, or a generated fallback — so the
 * source works with or without Better BibTeX installed.
 *
 * **PDF annotations:** when enabled, annotation items are fetched in the
 * same library sweep and mapped onto entries through the uniform
 * `entry.annotations` / `entry.attachments` interface.
 *
 * **Offline cache:** the last successful fetch is cached on disk (as DTOs).
 * If Zotero is closed on a later load, the cache keeps the library usable.
 * The cache also short-circuits online loads: a cheap library-version probe
 * against `Last-Modified-Version` serves the cache unchanged when the
 * library has not moved since the last fetch.
 *
 * **Periodic sync:** no file to watch, so the source optionally polls on a
 * configurable interval (same mechanism as the Better BibTeX source).
 */
export class ZoteroApiSource implements DataSource {
  private abortController: AbortController | null = null;
  private readonly poller: PeriodicSync | null;

  constructor(
    public readonly id: string,
    private client: ZoteroLocalApiClient,
    private scope: ZoteroApiScope,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    /** Current periodic-sync interval in ms (0 = disabled); read each cycle. */
    syncIntervalProvider?: () => number,
    /** Fetch native PDF annotations and attach them to entries. */
    private importAnnotations = false,
  ) {
    this.poller = syncIntervalProvider
      ? new PeriodicSync(syncIntervalProvider, 'ZoteroApiSource')
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
      let dtos: ZoteroApiEntryData[];
      let libraryVersion: number | null = null;
      const priorErrors: ParseErrorInfo[] = [];

      try {
        // Cheap change probe first: when the cached library version still
        // matches, serve the cache and skip the full multi-sweep re-fetch
        // (items + attachments + annotations + collections). Matters for
        // periodic sync against large libraries.
        const cached = await this.readCache();
        const unchanged =
          cached?.libraryVersion != null &&
          (await this.client.getLibraryVersion(this.scope, signal)) ===
            cached.libraryVersion;
        if (cached && unchanged) {
          dtos = cached.entries;
          libraryVersion = cached.libraryVersion;
        } else {
          const library = await this.client.fetchLibrary(this.scope, signal, {
            includeAnnotations: this.importAnnotations,
          });
          dtos = buildZoteroApiEntries(library, this.scope);
          libraryVersion = library.libraryVersion;
          await this.writeCache(dtos, libraryVersion);
        }
      } catch (error) {
        // A cancelled load is not a failure — let the caller's abort logic run.
        if (error instanceof ZoteroAbortError || signal.aborted) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        const cached = await this.readCache();
        if (!cached) {
          throw new Error(`Failed to load from Zotero local API: ${message}`);
        }
        console.warn(
          `ZoteroApiSource: Zotero unavailable, using cached library (${message})`,
        );
        dtos = cached.entries;
        priorErrors.push({
          message: `Zotero unavailable (using cache): ${message}`,
        });
      }

      const entries = convertToEntries(
        DATABASE_FORMATS.ZoteroApi,
        dtos as never,
      );

      return {
        sourceId: this.id,
        entries,
        modifiedAt: new Date(),
        parseErrors: priorErrors,
      };
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  /** Read and validate the cache file, or null when missing/corrupt. */
  private readCache(): Promise<ZoteroApiCacheStateV1 | null> {
    return readVersionedJsonCache(
      this.fileSystem,
      this.cachePath,
      isZoteroApiCacheState,
    );
  }

  /** Persist the fetched DTOs for offline use (best-effort). */
  private writeCache(
    entries: ZoteroApiEntryData[],
    libraryVersion: number | null,
  ): Promise<void> {
    return writeVersionedJsonCache(this.fileSystem, this.cachePath, {
      version: 1,
      entries,
      libraryVersion,
    } satisfies ZoteroApiCacheStateV1);
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
