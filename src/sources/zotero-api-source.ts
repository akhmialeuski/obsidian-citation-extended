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
interface ZoteroApiCacheStateV2 {
  version: 2;
  /** Pre-built entry DTOs (the same shape the adapter consumes). */
  entries: ZoteroApiEntryData[];
  /** Zotero library version at fetch time, or null. */
  libraryVersion: number | null;
  /**
   * Fetch parameters that determine WHICH content was cached. The cache file
   * is keyed by the stable database id, so a later scope or annotation-flag
   * change reuses the same file — these fields let the loader detect that the
   * cached content belongs to a different configuration and must be re-fetched
   * rather than served (which would otherwise show the wrong collection's
   * items, or serve annotation-less entries after annotations were enabled,
   * because the library-version probe alone cannot see a parameter change).
   */
  groupId: string;
  collectionKey: string;
  importAnnotations: boolean;
}

function isZoteroApiCacheState(
  parsed: unknown,
): parsed is ZoteroApiCacheStateV2 {
  if (parsed === null || typeof parsed !== 'object') return false;
  const c = parsed as Record<string, unknown>;
  return (
    c.version === 2 &&
    Array.isArray(c.entries) &&
    typeof c.groupId === 'string' &&
    typeof c.collectionKey === 'string' &&
    typeof c.importAnnotations === 'boolean'
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
    options?: DataSourceLoadOptions,
  ): Promise<DataSourceLoadResult> {
    this.abortController?.abort();
    const controller = createLinkedAbortController(externalSignal);
    this.abortController = controller;
    const signal = controller.signal;

    try {
      let dtos: ZoteroApiEntryData[];
      let libraryVersion: number | null = null;
      const priorErrors: ParseErrorInfo[] = [];

      // Read the cache once. Only a cache written for the CURRENT scope +
      // annotation flag is usable — the file is shared per database, so a cache
      // from a different configuration must never be served.
      const cached = await this.readCache();
      const usableCache =
        cached && this.cacheMatchesConfig(cached) ? cached : null;

      try {
        // Cheap change probe: when the cached library version still matches AND
        // the caller did not force a full refresh, serve the cache and skip the
        // full multi-sweep re-fetch (items + attachments + annotations +
        // collections). A `fullRefresh` (the manual "Refresh citation
        // database") bypasses this so a stale/wrong cache can always be
        // recovered from.
        const unchanged =
          !options?.fullRefresh &&
          usableCache?.libraryVersion != null &&
          (await this.client.getLibraryVersion(this.scope, signal)) ===
            usableCache.libraryVersion;
        if (usableCache && unchanged) {
          dtos = usableCache.entries;
          libraryVersion = usableCache.libraryVersion;
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
        // Offline fallback: only a cache for the current configuration is safe
        // to serve — a stale-scope cache would show the wrong items.
        if (!usableCache) {
          throw new Error(`Failed to load from Zotero local API: ${message}`);
        }
        console.warn(
          `ZoteroApiSource: Zotero unavailable, using cached library (${message})`,
        );
        dtos = usableCache.entries;
        priorErrors.push({
          message: `Zotero unavailable (using cache): ${message}`,
        });
      }

      const entries = convertToEntries(DATABASE_FORMATS.ZoteroApi, dtos);

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
  private readCache(): Promise<ZoteroApiCacheStateV2 | null> {
    return readVersionedJsonCache(
      this.fileSystem,
      this.cachePath,
      isZoteroApiCacheState,
    );
  }

  /**
   * True when a cache was written for the source's CURRENT scope + annotation
   * flag. The cache file is keyed by the stable database id, so a scope or
   * flag change reuses the same file; without this guard the version fast-path
   * (or the offline fallback) would serve content fetched for a different
   * configuration.
   */
  private cacheMatchesConfig(cached: ZoteroApiCacheStateV2): boolean {
    return (
      cached.groupId === (this.scope.groupId ?? '') &&
      cached.collectionKey === (this.scope.collectionKey ?? '') &&
      cached.importAnnotations === this.importAnnotations
    );
  }

  /** Persist the fetched DTOs for offline use (best-effort). */
  private writeCache(
    entries: ZoteroApiEntryData[],
    libraryVersion: number | null,
  ): Promise<void> {
    return writeVersionedJsonCache(this.fileSystem, this.cachePath, {
      version: 2,
      entries,
      libraryVersion,
      groupId: this.scope.groupId ?? '',
      collectionKey: this.scope.collectionKey ?? '',
      importAnnotations: this.importAnnotations,
    } satisfies ZoteroApiCacheStateV2);
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
