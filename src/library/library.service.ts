import type { IPlatformAdapter } from '../platform/platform-adapter';
import { CitationsPluginSettings } from '../ui/settings/settings';
import { Entry, Library, ParseErrorInfo } from '../core';
import { WorkerManager } from '../util';
import { LoadingStatus, LibraryState } from './library-state';
import { SearchService } from '../search/search.service';
import { sortEntries, ReferenceListSortOrder } from './sort-entries';
import {
  IntrospectionService,
  VariableDefinition,
} from '../template/introspection.service';
import { ILibraryService } from '../container';
import { LibraryStore } from './library-store';
import type { ISourceManager } from '../infrastructure/source-manager';
import type {
  NormalizationPipeline,
  SourceLoadResult,
} from '../infrastructure/normalization-pipeline';

/** Fallback timeout when the setting is missing (e.g. legacy config). */
const DEFAULT_LOAD_TIMEOUT_MS = 30_000;
const LOAD_DEBOUNCE_MS = 1_000;
const MAX_RETRY_COUNT = 5;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Thrown when source loading exceeds the configured timeout. Kept distinct from
 * transient errors so the retry logic can skip it: when a load times out the
 * parse is still running in the worker, and retrying would queue another parse
 * behind it — a self-worsening "retry storm" that can prevent the library from
 * ever loading.
 */
class LibraryLoadTimeoutError extends Error {
  constructor(seconds: number) {
    super(
      `Timeout loading citation database after ${seconds}s. ` +
        `If your library is large, raise "Library load timeout" in settings.`,
    );
    this.name = 'LibraryLoadTimeoutError';
  }
}

/**
 * Metadata collected from each source during loading.
 */
export interface SourceMetadata {
  sourceId: string;
  databaseName: string;
  entryCount: number;
  parseErrorCount: number;
  modifiedAt?: Date;
}

/**
 * Options for {@link LibraryService.load}.
 */
export interface LibraryLoadOptions {
  /**
   * Force every source to bypass its incremental-sync state (e.g. Readwise
   * `updatedAfter`). Set by the manual "Refresh citation database" command.
   */
  fullRefresh?: boolean;
}

export class LibraryService implements ILibraryService {
  library: Library | null = null;
  public searchService: SearchService;
  public introspectionService: IntrospectionService;
  public store: LibraryStore;
  public sourceMetadata: SourceMetadata[] = [];

  private loadWorker: WorkerManager;
  private abortController: AbortController | null = null;
  private loadDebounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;
  /**
   * Entries sorted per sort order, computed lazily and cached until the next
   * library build. The search modal asks for the sorted list on every input
   * event with an empty query — without this cache that is an O(N log N)
   * sort of the whole library per keystroke.
   */
  private sortedEntriesCache = new Map<ReferenceListSortOrder, Entry[]>();
  /** Source keys with pending watcher events, drained by the debounce timer. */
  private pendingSourceKeys = new Set<string>();

  constructor(
    private settings: CitationsPluginSettings,
    private platform: IPlatformAdapter,
    workerManager: WorkerManager,
    private sourceManager: ISourceManager,
    private pipeline: NormalizationPipeline,
  ) {
    this.loadWorker = workerManager;
    // Index builds run in the shared worker pool (off the main thread).
    this.searchService = new SearchService(workerManager);
    this.introspectionService = new IntrospectionService();
    this.store = new LibraryStore();
  }

  get state(): LibraryState {
    return this.store.getState();
  }

  getTemplateVariables(): VariableDefinition[] {
    return this.introspectionService.getTemplateVariables(this.library);
  }

  /**
   * All library entries sorted by the given order. The sorted array is
   * computed once per library build and cached, so callers on hot paths
   * (e.g. the search modal with an empty query) get an O(1) lookup.
   * Callers must NOT mutate the returned array.
   */
  getSortedEntries(order: ReferenceListSortOrder): readonly Entry[] {
    if (!this.library) return [];
    let sorted = this.sortedEntriesCache.get(order);
    if (!sorted) {
      sorted = sortEntries(Object.values(this.library.entries), order);
      this.sortedEntriesCache.set(order, sorted);
    }
    return sorted;
  }

  resolveLibraryPath(rawPath: string): string {
    return this.platform.resolvePath(rawPath);
  }

  private setState(newState: Partial<LibraryState>): void {
    this.store.setState(newState);
  }

  load = async (
    isRetry = false,
    options?: LibraryLoadOptions,
  ): Promise<Library | null> => {
    if (this.settings.databases.length === 0) {
      console.warn(
        'Citations plugin: No data sources configured. Please update plugin settings.',
      );
      this.platform.notifications.show(
        'No citation databases configured. Please add at least one database in the citation plugin settings.',
      );
      return null;
    }

    console.debug('Citation plugin: Reloading library from all sources');
    return this.runLoad(isRetry, (signal) => {
      this.sourceManager.syncSources(this.settings.databases);
      return this.sourceManager.loadAll(
        signal,
        options?.fullRefresh ? { fullRefresh: true } : undefined,
      );
    });
  };

  /**
   * Incrementally reload only the given sources (identified by their stable
   * source keys), reusing the cached results of every other source. Triggered
   * by per-source watcher events; falls back to a full {@link load} when no
   * library has been built yet.
   */
  private reloadSources = async (
    sourceKeys: string[],
  ): Promise<Library | null> => {
    if (!this.library) {
      return this.load();
    }

    console.debug(
      `Citation plugin: Incrementally reloading ${sourceKeys.length} source(s)`,
    );
    return this.runLoad(false, (signal) =>
      this.sourceManager.reloadSources(sourceKeys, signal),
    );
  };

  /**
   * Shared load driver: cancellation, state transitions, timeout race,
   * library build, and error/retry policy. The `fetchResults` callback
   * decides WHAT is loaded (all sources vs. an incremental subset).
   */
  private async runLoad(
    isRetry: boolean,
    fetchResults: (signal: AbortSignal) => Promise<SourceLoadResult[]>,
  ): Promise<Library | null> {
    if (this.abortController) {
      this.abortController.abort();
    }
    const controller = new AbortController();
    this.abortController = controller;
    const signal = controller.signal;

    if (!isRetry) {
      this.retryCount = 0;
      if (this.retryTimer) {
        window.clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    }

    this.setState({
      status: LoadingStatus.Loading,
      error: undefined,
      parseErrors: [],
    });

    try {
      const results = await this.raceWithTimeout(fetchResults(signal));
      if (signal.aborted) return null;

      await this.buildLibrary(results, signal);
      if (signal.aborted) return null;

      console.debug(
        `Citation plugin: successfully loaded library with ${this.library!.size} unique entries across ${results.length} sources.`,
      );

      this.retryCount = 0;
      this.initWatcher();

      return this.library;
    } catch (e) {
      if (signal.aborted) return null;

      const errorMsg = (e as Error).message || String(e);
      console.error('Citation plugin: Error loading library', e);
      this.setState({
        status: LoadingStatus.Error,
        error: e as Error,
        parseErrors: [
          `Unable to load citations: ${errorMsg}. Please check plugin settings and file paths.`,
        ],
      });

      if (e instanceof LibraryLoadTimeoutError) {
        // The timed-out race abandoned still-running source work (e.g. Readwise
        // HTTP + rate-limit back-offs). Abort the load signal so the threaded
        // sources actually stop, instead of leaking work past the timeout. Do
        // NOT retry — retrying would queue a second parse behind the first.
        controller.abort();
      } else {
        // Retry transient failures (e.g. a file briefly locked during a
        // Better BibTeX auto-export). The retry is always a FULL load: it is
        // the safest recovery path regardless of what kind of load failed.
        this.handleErrorRetry();
      }
      return null;
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  /**
   * Race a source-loading promise against the configured library timeout.
   */
  private async raceWithTimeout(
    loadPromise: Promise<SourceLoadResult[]>,
  ): Promise<SourceLoadResult[]> {
    const timeoutSeconds =
      this.settings.libraryLoadTimeoutSeconds ?? DEFAULT_LOAD_TIMEOUT_MS / 1000;

    let timeoutId: number = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new LibraryLoadTimeoutError(timeoutSeconds)),
        timeoutSeconds * 1000,
      );
    });

    // If the timeout wins the race, loadPromise keeps running and may later
    // reject (e.g. every source fails). Attach a no-op handler so that late
    // rejection is not an unhandled promise rejection — the real failure is
    // already surfaced via the timeout-driven Error state.
    loadPromise.catch(() => {});

    try {
      return await Promise.race([loadPromise, timeoutPromise]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  private async buildLibrary(
    results: SourceLoadResult[],
    signal: AbortSignal,
  ): Promise<void> {
    let totalParseErrors = 0;
    const allParseErrors: ParseErrorInfo[] = [];

    this.sourceMetadata = results.map((r) => {
      const errorCount = r.parseErrors?.length ?? 0;
      totalParseErrors += errorCount;
      if (r.parseErrors) {
        allParseErrors.push(...r.parseErrors);
      }
      return {
        sourceId: r.sourceId,
        databaseName: r.databaseName,
        entryCount: r.entries.length,
        parseErrorCount: errorCount,
        modifiedAt: r.modifiedAt,
      };
    });

    this.library = this.pipeline.run(results);
    this.sortedEntriesCache.clear();

    console.debug('Citation plugin: Building search index');
    // Async chunked build: yields to the event loop so the UI never freezes;
    // searches keep hitting the previous index until the new one is swapped in.
    await this.searchService.buildIndex(Object.values(this.library.entries));

    // A newer load may have superseded this one while the index was building;
    // it owns the state transitions from here on.
    if (signal.aborted) return;

    const parseErrorMessages =
      totalParseErrors > 0
        ? allParseErrors.slice(0, 10).map((pe) => pe.message)
        : [];

    if (totalParseErrors > 0) {
      console.warn(
        `Citation plugin: ${totalParseErrors} entries skipped due to parse errors.`,
        allParseErrors.slice(0, 5),
      );
    }

    this.setState({
      status: LoadingStatus.Success,
      lastLoaded: new Date(),
      progress: { current: this.library.size, total: this.library.size },
      parseErrors: parseErrorMessages,
    });
  }

  private handleErrorRetry(): void {
    if (this.retryCount < MAX_RETRY_COUNT) {
      const delay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, this.retryCount),
        MAX_RETRY_DELAY_MS,
      );
      this.retryCount++;
      console.debug(
        `Citation plugin: Retrying load in ${delay}ms (Attempt ${this.retryCount})`,
      );
      this.retryTimer = window.setTimeout(() => {
        void this.load(true);
      }, delay);
    }
  }

  initWatcher(): void {
    this.sourceManager.initWatchers((sourceKey) =>
      this.triggerLoadWithDebounce(sourceKey),
    );
  }

  private triggerLoadWithDebounce(sourceKey?: string): void {
    if (sourceKey) {
      this.pendingSourceKeys.add(sourceKey);
    }

    if (this.loadDebounceTimer) {
      window.clearTimeout(this.loadDebounceTimer);
    }

    this.loadDebounceTimer = window.setTimeout(() => {
      const keys = [...this.pendingSourceKeys];
      this.pendingSourceKeys.clear();
      // Changed sources are reloaded incrementally; everything else is
      // served from the source manager's cached results. A full load runs
      // only when no specific source was identified.
      if (keys.length > 0) {
        void this.reloadSources(keys);
      } else {
        void this.load();
      }
    }, LOAD_DEBOUNCE_MS);
  }

  dispose = (): void => {
    if (this.loadDebounceTimer) {
      window.clearTimeout(this.loadDebounceTimer);
      this.loadDebounceTimer = null;
    }
    this.pendingSourceKeys.clear();

    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.sourceManager.dispose();
    this.loadWorker.dispose();
    this.store.dispose();

    console.debug('LibraryService: Disposed all resources');
  };

  get isLibraryLoading(): boolean {
    return this.store.getState().status === LoadingStatus.Loading;
  }
}
