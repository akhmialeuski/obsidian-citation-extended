import { FileSystemAdapter } from 'obsidian';
import * as path from 'path';
import { CitationsPluginSettings } from '../settings';
import { Entry, Library } from '../types';
import { Notifier, WorkerManager } from '../util';
import { LoadingStatus, LibraryState } from '../library-state';
import CitationEvents from '../events';
import { DataSource, MergeStrategy } from '../data-source';
import { SearchService } from '../search/search.service';

export class LibraryService {
  library!: Library;
  public searchService: SearchService;
  private loadWorker: WorkerManager;
  private abortController: AbortController | null = null;
  private sources: DataSource[] = [];
  private loadDebounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;

  // State
  state: LibraryState = {
    status: LoadingStatus.Idle,
  };

  loadErrorNotifier = new Notifier(
    'Unable to load citations. Please update Citations plugin settings.',
  );

  constructor(
    private settings: CitationsPluginSettings,
    private events: CitationEvents,
    private vaultAdapter: FileSystemAdapter | null, // To resolve path
    workerManager: WorkerManager,
    sources: DataSource[] = [],
    private mergeStrategy: MergeStrategy = MergeStrategy.LastWins,
  ) {
    this.loadWorker = workerManager;
    this.sources = sources;
    this.searchService = new SearchService();
  }

  /**
   * Get the worker manager for creating data sources
   */
  getWorkerManager(): WorkerManager {
    return this.loadWorker;
  }

  /**
   * Add a data source to the library service
   */
  addSource(source: DataSource): void {
    this.sources.push(source);
    console.debug(`LibraryService: Added source ${source.id}`);
  }

  /**
   * Remove a data source by ID
   */
  removeSource(sourceId: string): void {
    const index = this.sources.findIndex((s) => s.id === sourceId);
    if (index !== -1) {
      const source = this.sources[index];
      source.dispose();
      this.sources.splice(index, 1);
      console.debug(`LibraryService: Removed source ${sourceId}`);
    }
  }

  /**
   * Get all data sources
   */
  getSources(): DataSource[] {
    return [...this.sources];
  }

  /**
   * Resolve a provided library path, allowing for relative paths rooted at
   * the vault directory. (Helper method for settings tab)
   */
  resolveLibraryPath(rawPath: string): string {
    const vaultRoot =
      this.vaultAdapter instanceof FileSystemAdapter
        ? this.vaultAdapter.getBasePath()
        : '/';
    return path.resolve(vaultRoot, rawPath);
  }

  private setState(newState: Partial<LibraryState>): void {
    this.state = { ...this.state, ...newState };
    this.events.trigger('library-state-changed', this.state);
  }

  /**
   * Merge entries from multiple sources according to the merge strategy
   */
  private mergeEntries(results: Entry[][]): Library {
    const entriesMap = new Map<string, Entry>();

    switch (this.mergeStrategy) {
      case MergeStrategy.LastWins:
        // Later sources override earlier ones
        for (const entries of results) {
          for (const entry of entries) {
            entriesMap.set(entry.id, entry);
          }
        }
        break;

      case MergeStrategy.FirstWins:
        // Earlier sources take precedence
        for (const entries of results) {
          for (const entry of entries) {
            if (!entriesMap.has(entry.id)) {
              entriesMap.set(entry.id, entry);
            }
          }
        }
        break;

      case MergeStrategy.MostRecent:
        // Compare modification dates (for now, use LastWins as fallback)
        // TODO: Implement proper date comparison when sources provide timestamps
        for (const entries of results) {
          for (const entry of entries) {
            entriesMap.set(entry.id, entry);
          }
        }
        break;
    }

    return new Library(Object.fromEntries(entriesMap));
  }

  async load(isRetry = false): Promise<Library | null> {
    if (this.sources.length === 0) {
      console.warn(
        'Citations plugin: No data sources configured. Please update plugin settings.',
      );
      return null;
    }

    // Cancel previous load if running
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

    this.setState({ status: LoadingStatus.Loading, error: undefined });
    console.debug('Citation plugin: Reloading library from all sources');
    this.events.trigger('library-load-start');

    try {
      // Load from all sources in parallel
      const loadPromises = this.sources.map(async (source) => {
        try {
          console.debug(`LibraryService: Loading from source ${source.id}`);
          const entries = await source.load();
          console.debug(
            `LibraryService: Loaded ${entries.length} entries from ${source.id}`,
          );
          return entries;
        } catch (error) {
          console.error(
            `LibraryService: Error loading from source ${source.id}:`,
            error,
          );
          // Return empty array for failed sources, don't fail entire load
          return [];
        }
      });

      const results = await Promise.all(loadPromises);

      if (signal.aborted) return null;

      // Merge results according to strategy
      this.library = this.mergeEntries(results);

      // Build search index
      console.debug('Citation plugin: Building search index');
      this.searchService.buildIndex(Object.values(this.library.entries));

      const totalEntries = results.reduce(
        (sum, entries) => sum + entries.length,
        0,
      );

      this.setState({
        status: LoadingStatus.Success,
        lastLoaded: new Date(),
        progress: { current: this.library.size, total: this.library.size },
      });

      console.debug(
        `Citation plugin: successfully loaded library with ${this.library.size} unique entries from ${totalEntries} total entries across ${this.sources.length} sources.`,
      );

      this.events.trigger('library-load-complete');
      this.loadErrorNotifier.hide();
      this.retryCount = 0;

      return this.library;
    } catch (e) {
      if (signal.aborted) return null;

      console.error('Citation plugin: Error loading library', e);
      this.setState({ status: LoadingStatus.Error, error: e as Error });
      this.loadErrorNotifier.show();

      this.handleErrorRetry();
      return null;
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  private handleErrorRetry(): void {
    if (this.retryCount < 5) {
      const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
      this.retryCount++;
      console.log(
        `Citation plugin: Retrying load in ${delay}ms (Attempt ${this.retryCount})`,
      );
      this.retryTimer = window.setTimeout(() => {
        this.load(true);
      }, delay);
    }
  }

  /**
   * Initialize watchers for all data sources
   */
  initWatcher(): void {
    if (this.sources.length === 0) {
      console.warn('LibraryService: No sources to watch');
      return;
    }

    // Set up watchers for all sources
    for (const source of this.sources) {
      try {
        source.watch(() => {
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
      this.load();
    }, 1000); // 1s debounce
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Clear timers
    if (this.loadDebounceTimer) {
      window.clearTimeout(this.loadDebounceTimer);
      this.loadDebounceTimer = null;
    }

    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Abort any ongoing load
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Dispose all sources
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
    console.debug('LibraryService: Disposed all resources');
  }

  /**
   * Returns true iff the library is currently being loaded on the worker thread.
   */
  get isLibraryLoading(): boolean {
    return this.state.status === LoadingStatus.Loading;
  }
}
