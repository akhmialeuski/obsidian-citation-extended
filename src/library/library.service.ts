import * as path from 'path';
import type { IPlatformAdapter } from '../platform/platform-adapter';
import { CitationsPluginSettings } from '../ui/settings/settings';
import { Entry, Library, ParseErrorInfo } from '../core';
import { WorkerManager } from '../util';
import { LoadingStatus, LibraryState } from './library-state';
import {
  DataSource,
  DataSourceLoadResult,
  DATA_SOURCE_TYPES,
} from '../data-source';
import { MergeStrategy } from './merge-strategy';
import { SearchService } from '../search/search.service';
import {
  IntrospectionService,
  VariableDefinition,
} from '../template/introspection.service';
import { ILibraryService } from '../container';
import { IDataSourceFactory } from '../sources/data-source-factory';
import { LibraryStore } from './library-store';

const LOAD_TIMEOUT_MS = 10_000;
const LOAD_DEBOUNCE_MS = 1_000;
const MAX_RETRY_COUNT = 5;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Metadata collected from each source during loading.
 */
interface SourceMetadata {
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
  private sources: DataSource[] = [];
  private loadDebounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;
  private dataSourceFactory: IDataSourceFactory | null = null;

  constructor(
    private settings: CitationsPluginSettings,
    private platform: IPlatformAdapter,
    workerManager: WorkerManager,
    sources: DataSource[] = [],
    private mergeStrategy: MergeStrategy = MergeStrategy.LastWins,
  ) {
    this.loadWorker = workerManager;
    this.sources = sources;
    this.searchService = new SearchService();
    this.introspectionService = new IntrospectionService();
    this.store = new LibraryStore();
  }

  /**
   * Inject a DataSourceFactory for creating sources from settings.
   */
  setDataSourceFactory(factory: IDataSourceFactory): void {
    this.dataSourceFactory = factory;
  }

  get state(): LibraryState {
    return this.store.getState();
  }

  addSource(source: DataSource): void {
    this.sources.push(source);
    console.debug(`LibraryService: Added source ${source.id}`);
  }

  removeSource(sourceId: string): void {
    const index = this.sources.findIndex((s) => s.id === sourceId);
    if (index !== -1) {
      const source = this.sources[index];
      source.dispose();
      this.sources.splice(index, 1);
      console.debug(`LibraryService: Removed source ${sourceId}`);
    }
  }

  getSources(): DataSource[] {
    return [...this.sources];
  }

  getTemplateVariables(): VariableDefinition[] {
    return this.introspectionService.getTemplateVariables(this.library);
  }

  resolveLibraryPath(rawPath: string): string {
    const vaultRoot = this.platform.fileSystem.getBasePath() || '/';
    return path.resolve(vaultRoot, rawPath);
  }

  private setState(newState: Partial<LibraryState>): void {
    this.store.setState(newState);
  }

  private mergeEntries(results: Entry[][]): Library {
    const entriesMap = new Map<string, Entry>();
    const citekeyCounts = new Map<string, number>();

    for (const entries of results) {
      for (const entry of entries) {
        citekeyCounts.set(entry.id, (citekeyCounts.get(entry.id) || 0) + 1);
      }
    }

    for (const entries of results) {
      for (const entry of entries) {
        if (citekeyCounts.get(entry.id)! > 1) {
          const compositeKey = `${entry.id}@${entry._sourceDatabase}`;
          entry._compositeCitekey = compositeKey;
          entry.id = compositeKey;
        }
        entriesMap.set(entry.id, entry);
      }
    }

    return new Library(Object.fromEntries(entriesMap));
  }

  load = async (isRetry = false): Promise<Library | null> => {
    if (this.settings.databases.length === 0) {
      console.warn(
        'Citations plugin: No data sources configured. Please update plugin settings.',
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
      this.sources = this.createSources();

      const loadPromises = this.sources.map(async (source, index) => {
        try {
          console.debug(`LibraryService: Loading from source ${source.id}`);
          const result: DataSourceLoadResult = await source.load();
          console.debug(
            `LibraryService: Loaded ${result.entries.length} entries from ${source.id}`,
          );
          const dbName = this.settings.databases[index].name;
          result.entries.forEach((entry) => {
            entry._sourceDatabase = dbName;
          });
          return result;
        } catch (error) {
          console.error(
            `LibraryService: Error loading from source ${source.id}:`,
            error,
          );
          return error instanceof Error ? error : new Error(String(error));
        }
      });

      let timeoutId: number = 0;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('Timeout loading citation database')),
          LOAD_TIMEOUT_MS,
        );
      });

      const results = await Promise.race([
        Promise.all(loadPromises),
        timeoutPromise,
      ]);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (signal.aborted) return null;

      const successfulResults = results.filter(
        (r): r is DataSourceLoadResult => !(r instanceof Error),
      );
      const errors = results.filter((r): r is Error => r instanceof Error);

      if (successfulResults.length === 0 && errors.length > 0) {
        throw errors[0];
      }

      let totalParseErrors = 0;
      const allParseErrors: ParseErrorInfo[] = [];

      this.sourceMetadata = successfulResults.map((r) => {
        const sourceIndex = parseInt(r.sourceId.replace('source-', ''), 10);
        const errorCount = r.parseErrors?.length ?? 0;
        totalParseErrors += errorCount;
        if (r.parseErrors) {
          allParseErrors.push(...r.parseErrors);
        }
        return {
          sourceId: r.sourceId,
          databaseName:
            this.settings.databases[sourceIndex]?.name ?? r.sourceId,
          entryCount: r.entries.length,
          parseErrorCount: errorCount,
          modifiedAt: r.modifiedAt,
        };
      });

      const entryArrays = successfulResults.map((r) => r.entries);
      this.library = this.mergeEntries(entryArrays);

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

      const totalEntries = entryArrays.reduce(
        (sum, entries) => sum + entries.length,
        0,
      );

      console.debug(
        `Citation plugin: successfully loaded library with ${this.library.size} unique entries from ${totalEntries} total entries across ${this.sources.length} sources.`,
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

  private createSources(): DataSource[] {
    // If sources were injected via constructor, use them as-is
    if (this.sources.length > 0) {
      return this.sources;
    }
    if (!this.dataSourceFactory) {
      console.warn('Citations plugin: No data source factory configured.');
      return [];
    }
    return this.settings.databases.map((db, index) =>
      this.dataSourceFactory!.create(
        { type: DATA_SOURCE_TYPES.LocalFile, path: db.path, format: db.type },
        `source-${index}`,
      ),
    );
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
    this.sources.forEach((s) => s.dispose());

    if (this.sources.length === 0) {
      return;
    }

    for (const source of this.sources) {
      try {
        source.watch(() => {
          console.debug(`LibraryService: Change detected in ${source.id}`);
          this.triggerLoadWithDebounce();
        });
        console.debug(
          `LibraryService: Initialized watcher for source ${source.id}`,
        );
      } catch (error) {
        console.error(
          `LibraryService: Error setting up watcher for source ${source.id}:`,
          error,
        );
      }
    }
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

    for (const source of this.sources) {
      try {
        source.dispose();
      } catch (error) {
        console.error(
          `LibraryService: Error disposing source ${source.id}:`,
          error,
        );
      }
    }

    this.sources = [];
    this.loadWorker.dispose();
    this.store.dispose();

    console.debug('LibraryService: Disposed all resources');
  };

  get isLibraryLoading(): boolean {
    return this.store.getState().status === LoadingStatus.Loading;
  }
}
