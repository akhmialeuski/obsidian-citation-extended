import type { IPlatformAdapter } from '../platform/platform-adapter';
import { CitationsPluginSettings } from '../ui/settings/settings';
import { Library, ParseErrorInfo } from '../core';
import { WorkerManager } from '../util';
import { LoadingStatus, LibraryState } from './library-state';
import { SearchService } from '../search/search.service';
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

const LOAD_TIMEOUT_MS = 10_000;
const LOAD_DEBOUNCE_MS = 1_000;
const MAX_RETRY_COUNT = 5;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

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

  constructor(
    private settings: CitationsPluginSettings,
    private platform: IPlatformAdapter,
    workerManager: WorkerManager,
    private sourceManager: ISourceManager,
    private pipeline: NormalizationPipeline,
  ) {
    this.loadWorker = workerManager;
    this.searchService = new SearchService();
    this.introspectionService = new IntrospectionService();
    this.store = new LibraryStore();
  }

  get state(): LibraryState {
    return this.store.getState();
  }

  getTemplateVariables(): VariableDefinition[] {
    return this.introspectionService.getTemplateVariables(this.library);
  }

  resolveLibraryPath(rawPath: string): string {
    return this.platform.resolvePath(rawPath);
  }

  private setState(newState: Partial<LibraryState>): void {
    this.store.setState(newState);
  }

  load = async (isRetry = false): Promise<Library | null> => {
    if (this.settings.databases.length === 0) {
      console.warn(
        'Citations plugin: No data sources configured. Please update plugin settings.',
      );
      this.platform.notifications.show(
        'No citation databases configured. Please add at least one database in the citation plugin settings.',
      );
      return null;
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

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
    console.debug('Citation plugin: Reloading library from all sources');

    try {
      const results = await this.loadFromSources();
      if (signal.aborted) return null;

      this.buildLibrary(results);

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

      this.handleErrorRetry();
      return null;
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  };

  private async loadFromSources(): Promise<SourceLoadResult[]> {
    this.sourceManager.syncSources(this.settings.databases);

    let timeoutId: number = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('Timeout loading citation database')),
        LOAD_TIMEOUT_MS,
      );
    });

    try {
      const results = await Promise.race([
        this.sourceManager.loadAll(),
        timeoutPromise,
      ]);
      return results;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  private buildLibrary(results: SourceLoadResult[]): void {
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

    console.debug('Citation plugin: Building search index');
    this.searchService.buildIndex(Object.values(this.library.entries));

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
    this.sourceManager.initWatchers(() => this.triggerLoadWithDebounce());
  }

  private triggerLoadWithDebounce(): void {
    if (this.loadDebounceTimer) {
      window.clearTimeout(this.loadDebounceTimer);
    }

    this.loadDebounceTimer = window.setTimeout(() => {
      void this.load();
    }, LOAD_DEBOUNCE_MS);
  }

  dispose = (): void => {
    if (this.loadDebounceTimer) {
      window.clearTimeout(this.loadDebounceTimer);
      this.loadDebounceTimer = null;
    }

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
