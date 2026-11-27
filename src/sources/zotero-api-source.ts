import type {
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
import {
  fetchZoteroDelta,
  MissingZoteroDeltaRecordError,
} from '../core/zotero/zotero-api-delta';
import type {
  ZoteroApiRawLibrary,
  ZoteroChangeCounts,
} from '../core/zotero/zotero-api-delta';
import {
  supportsLocalVersions,
  ZOTERO_LOCAL_API_DEFAULT_BASE,
  ZoteroLocalApiError,
  ZoteroServerChangedError,
  ZoteroSnapshotError,
} from '../core/zotero/zotero-local-api-client';
import type {
  ZoteroApiLibraryState,
  ZoteroApiScope,
  ZoteroLocalApiClient,
} from '../core/zotero/zotero-local-api-client';
import type { IFileSystem } from '../platform/platform-adapter';
import {
  createLinkedAbortController,
  PeriodicSync,
  readVersionedJsonCache,
  writeVersionedJsonCache,
} from './source-utils';
import { isZoteroApiCache, snapshotToCache } from './zotero-api-cache';
import type { ZoteroApiCache, ZoteroApiCacheV3 } from './zotero-api-cache';

/** In-process evidence that a compatible cache may belong to an obsolete instance or version. */
interface ServerObservation {
  serverId?: string;
  rejectedServerId?: string | null;
  rolledBack?: ZoteroApiLibraryState;
}

interface SyncDiagnostic {
  startedAt: number;
  mode: 'full' | 'incremental' | 'unchanged' | 'offline';
  libraryVersion: number | null;
  fullReason?: string;
  changes?: ZoteroChangeCounts;
}

function logSync(
  diagnostic: SyncDiagnostic,
  cache: ZoteroApiCache | null,
): void {
  const { mode, startedAt, libraryVersion, fullReason, changes } = diagnostic;
  const summary = {
    mode,
    cachedVersion: cache?.libraryVersion ?? null,
    libraryVersion,
    durationMs: Math.round(performance.now() - startedAt),
    ...(mode === 'full' ? { reason: fullReason } : {}),
    ...(mode === 'incremental' ? { changes } : {}),
  };
  if (mode === 'offline') {
    console.warn('ZoteroApiSource: using cached library', summary);
  } else {
    console.debug('ZoteroApiSource: synchronization complete', summary);
  }
}

const UNKNOWN_LIBRARY_STATE: ZoteroApiLibraryState = {
  serverId: null,
  libraryVersion: null,
};

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ZoteroAbortError();
}

function sameState(
  a: ZoteroApiLibraryState,
  b: ZoteroApiLibraryState,
): boolean {
  return a.serverId === b.serverId && a.libraryVersion === b.libraryVersion;
}

function hasRawBaseline(
  cache: ZoteroApiCache | null,
): cache is ZoteroApiCacheV3 & {
  rawLibrary: ZoteroApiRawLibrary;
  serverId: string;
  libraryVersion: number;
} {
  return (
    cache?.version === 3 &&
    cache.rawLibrary !== undefined &&
    supportsLocalVersions(cache)
  );
}

/**
 * Data source backed by Zotero's native Local API (Zotero 7+). The adapter
 * resolves citekeys from the native `citationKey` field (Zotero 7.0.31+), a
 * legacy `Citation Key:` line in Extra, or a generated fallback.
 *
 * Full fetches and merged incremental fetches both pass through
 * `buildZoteroApiEntries` and then `convertToEntries('zotero-api')`. The
 * builder resolves collections and attachment paths and exposes enabled PDF
 * annotations through the common `entry.annotations` and `entry.attachments`
 * interfaces.
 *
 * The last successful compatible snapshot keeps the library usable when
 * Zotero is closed. For eligible whole-library sources, a matching server ID
 * and library version also let an online load reuse the cached DTOs.
 *
 * The source has no local file to watch and uses the same optional polling
 * mechanism as the Better BibTeX source.
 */
export class ZoteroApiSource implements DataSource {
  private abortController: AbortController | null = null;
  private readonly poller: PeriodicSync | null;
  private readonly config: Pick<
    ZoteroApiCacheV3,
    'baseUrl' | 'groupId' | 'collectionKey' | 'importAnnotations'
  >;
  private readonly observed: ServerObservation = {};

  constructor(
    public readonly id: string,
    private readonly client: ZoteroLocalApiClient,
    private readonly scope: ZoteroApiScope,
    private readonly fileSystem?: IFileSystem,
    private readonly cachePath?: string,
    /** Periodic sync interval in milliseconds (0 disables polling), read each cycle. */
    syncIntervalProvider?: () => number,
    /** Import native PDF annotations and associate them with their entries. */
    importAnnotations = false,
  ) {
    this.poller = syncIntervalProvider
      ? new PeriodicSync(syncIntervalProvider, 'ZoteroApiSource')
      : null;
    this.config = {
      baseUrl: client.baseUrl,
      groupId: scope.groupId ?? '',
      collectionKey: scope.collectionKey ?? '',
      importAnnotations,
    };
  }

  async load(
    externalSignal?: AbortSignal,
    options?: DataSourceLoadOptions,
  ): Promise<DataSourceLoadResult> {
    const diagnostic: SyncDiagnostic = {
      startedAt: performance.now(),
      mode: 'offline',
      libraryVersion: null,
    };
    this.abortController?.abort();
    const controller = createLinkedAbortController(externalSignal);
    this.abortController = controller;
    const { signal } = controller;

    try {
      checkAborted(signal);
      // Read and validate the saved snapshot once. Missing or corrupt files
      // are cache misses.
      const cache = await readVersionedJsonCache(
        this.fileSystem,
        this.cachePath,
        isZoteroApiCache,
      );
      checkAborted(signal);
      const compatible = cache && this.cacheMatchesConfig(cache) ? cache : null;

      return await this.loadWithFallback(
        compatible,
        signal,
        options?.fullRefresh ?? false,
        diagnostic,
      );
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  private async loadWithFallback(
    cache: ZoteroApiCache | null,
    signal: AbortSignal,
    forceFull: boolean,
    diagnostic: SyncDiagnostic,
  ): Promise<DataSourceLoadResult> {
    try {
      const snapshot = await this.synchronize(
        cache,
        signal,
        forceFull,
        diagnostic,
      );
      checkAborted(signal);
      const result = this.result(snapshot);
      if (snapshot !== cache) await this.commit(snapshot, signal);
      checkAborted(signal);
      diagnostic.libraryVersion = snapshot.libraryVersion;
      logSync(diagnostic, cache);
      return result;
    } catch (error) {
      // Let the caller handle cancellation before considering offline fallback.
      if (error instanceof ZoteroAbortError) throw error;
      checkAborted(signal);
      const message = error instanceof Error ? error.message : String(error);
      if (!cache || !this.cacheMatchesServer(cache)) {
        throw new Error(`Failed to load from Zotero local API: ${message}`);
      }
      diagnostic.mode = 'offline';
      logSync(diagnostic, cache);
      return this.result(
        cache,
        `Zotero synchronization failed (using cache): ${message}`,
      );
    }
  }

  private async synchronize(
    cache: ZoteroApiCache | null,
    signal: AbortSignal,
    forceFull: boolean,
    diagnostic: SyncDiagnostic,
  ): Promise<ZoteroApiCacheV3> {
    let fullReason = forceFull ? 'manual refresh' : null;
    let consistencyRetryAvailable = true;
    for (;;) {
      checkAborted(signal);
      let state = UNKNOWN_LIBRARY_STATE;
      try {
        state = await this.probe(signal);
        diagnostic.libraryVersion = state.libraryVersion;
        return await this.syncSnapshot(
          state,
          cache,
          signal,
          fullReason,
          diagnostic,
        );
      } catch (error) {
        checkAborted(signal);
        if (error instanceof MissingZoteroDeltaRecordError) {
          // Only a delta can have missing records. The next attempt uses a
          // full fetch, leaving the consistency retry budget available.
          fullReason = error.message;
          continue;
        }
        fullReason = this.snapshotRetryReason(error, state) ?? fullReason;
        if (!consistencyRetryAvailable) throw error;
        consistencyRetryAvailable = false;
      }
    }
  }

  private snapshotRetryReason(
    error: unknown,
    state: ZoteroApiLibraryState,
  ): string | null {
    if (error instanceof ZoteroLocalApiError)
      this.observeServer(error.serverId);
    if (!(error instanceof ZoteroSnapshotError)) throw error;
    if (!(error instanceof ZoteroServerChangedError)) return null;
    // Keep the rejection if the replacement fetch fails and the instance
    // is unreachable on the next load.
    this.observed.rejectedServerId = state.serverId;
    return 'server identity changed during synchronization';
  }

  private async syncSnapshot(
    state: ZoteroApiLibraryState,
    cache: ZoteroApiCache | null,
    signal: AbortSignal,
    fullReason: string | null,
    diagnostic: SyncDiagnostic,
  ): Promise<ZoteroApiCacheV3> {
    // The manual "Refresh citation database" command bypasses both the
    // unchanged fast path and delta retrieval so it can rebuild the snapshot.
    const baseline = this.incrementalBaseline(state, cache);
    const plan = fullReason ?? baseline;
    if (typeof plan !== 'string' && sameState(plan, state)) {
      diagnostic.mode = 'unchanged';
      return plan;
    }

    const library = await this.fetchSnapshot(plan, state, signal, diagnostic);
    const entries = buildZoteroApiEntries(library, this.scope);

    // A tracked full fetch also needs this check before it can establish an
    // incremental baseline. Its separate sweeps can span a Zotero edit.
    await this.verifySnapshot(state, signal);
    const cacheState = state.serverId
      ? state
      : { ...state, libraryVersion: library.libraryVersion };
    return snapshotToCache(library, entries, cacheState, this.config);
  }

  private async fetchSnapshot(
    plan: string | { rawLibrary: ZoteroApiRawLibrary; libraryVersion: number },
    state: ZoteroApiLibraryState,
    signal: AbortSignal,
    diagnostic: SyncDiagnostic,
  ) {
    const { importAnnotations } = this.config;
    const reader = this.client.pinnedTo(state);
    if (typeof plan === 'string') {
      diagnostic.mode = 'full';
      diagnostic.fullReason = plan;
      return reader.fetchLibrary(this.scope, signal, {
        includeAnnotations: importAnnotations,
      });
    }
    const { library, changes } = await fetchZoteroDelta(
      reader,
      this.scope,
      plan,
      { includeAnnotations: importAnnotations, signal },
    );
    diagnostic.mode = 'incremental';
    diagnostic.changes = changes;
    return library;
  }

  private async verifySnapshot(
    state: ZoteroApiLibraryState,
    signal: AbortSignal,
  ): Promise<void> {
    if (state.serverId === null) return;
    const finalState = await this.probe(signal);
    if (sameState(state, finalState)) return;
    if (
      finalState.serverId !== null &&
      finalState.serverId !== state.serverId
    ) {
      throw new ZoteroServerChangedError(
        'Zotero server identity changed during synchronization.',
        undefined,
        finalState.serverId,
      );
    }
    throw new ZoteroSnapshotError(
      'Zotero library changed during synchronization.',
      undefined,
      finalState.serverId,
    );
  }

  private async probe(signal: AbortSignal): Promise<ZoteroApiLibraryState> {
    const state = await this.client.getLibraryState(this.scope, signal);
    checkAborted(signal);
    this.observeServer(state.serverId);
    return state;
  }

  private observeServer(serverId: string | null): void {
    if (serverId) this.observed.serverId = serverId;
  }

  private incrementalBaseline(
    state: ZoteroApiLibraryState,
    cache: ZoteroApiCache | null,
  ) {
    if (this.config.collectionKey) return 'collection scope';
    if (!supportsLocalVersions(state))
      return 'local version tracking unavailable';
    if (!hasRawBaseline(cache)) return 'no compatible incremental baseline';
    if (!this.cacheMatchesServer(cache)) return 'server identity changed';
    if (state.libraryVersion < cache.libraryVersion) {
      // Require a new baseline even if the version reaches this value again
      // before the source manages to save a replacement.
      this.observed.rolledBack = {
        serverId: cache.serverId,
        libraryVersion: cache.libraryVersion,
      };
    }
    if (this.observed.rolledBack && sameState(cache, this.observed.rolledBack))
      return 'library version rolled back';
    return cache;
  }

  /**
   * The cache filename follows the stable database ID across configuration
   * changes. Check the fetch parameters before online reuse or offline fallback.
   */
  private cacheMatchesConfig(cache: ZoteroApiCache): boolean {
    const { baseUrl, groupId, collectionKey, importAnnotations } = this.config;
    return (
      cache.groupId === groupId &&
      cache.collectionKey === collectionKey &&
      cache.importAnnotations === importAnnotations &&
      (cache.version === 2
        ? baseUrl === ZOTERO_LOCAL_API_DEFAULT_BASE
        : cache.baseUrl === baseUrl)
    );
  }

  private cacheMatchesServer(cache: ZoteroApiCache): boolean {
    if (cache.version === 2 || cache.serverId === null) return true;
    const { serverId, rejectedServerId } = this.observed;
    return (
      cache.serverId !== rejectedServerId &&
      (!serverId || cache.serverId === serverId)
    );
  }

  private result(
    cache: ZoteroApiCache,
    warning?: string,
  ): DataSourceLoadResult {
    return {
      sourceId: this.id,
      entries: convertToEntries(DATABASE_FORMATS.ZoteroApi, cache.entries),
      modifiedAt: new Date(),
      parseErrors: warning ? [{ message: warning }] : [],
    };
  }

  /** Persist the validated snapshot as a best-effort cache update. */
  private async commit(
    snapshot: ZoteroApiCacheV3,
    signal: AbortSignal,
  ): Promise<void> {
    if (
      await writeVersionedJsonCache(
        this.fileSystem,
        this.cachePath,
        snapshot,
        signal,
      )
    ) {
      this.observed.rejectedServerId = undefined;
      this.observed.rolledBack = undefined;
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
