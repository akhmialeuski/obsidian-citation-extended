import { FileSystemAdapter } from 'obsidian';
import * as path from 'path';
import { CitationsPluginSettings } from '../settings';
import { Entry, Library } from '../types';
import { Notifier, WorkerManager } from '../util';
import { LoadingStatus, LibraryState } from '../library-state';
import CitationEvents from '../events';
import { DataSource, MergeStrategy } from '../data-source';
import { SearchService } from '../search/search.service';
import {
  IntrospectionService,
  VariableDefinition,
} from './introspection.service';
import { LocalFileSource } from '../sources/local-file-source';

export class LibraryService {
  library!: Library;
  public searchService: SearchService;
  public introspectionService: IntrospectionService;
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
    this.introspectionService = new IntrospectionService();
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
   * Get available template variables from the current library
   */
  getTemplateVariables(): VariableDefinition[] {
    return this.introspectionService.getTemplateVariables(this.library);
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
   * Merge entries from multiple sources, handling duplicates by creating composite keys
   */
  private mergeEntries(results: Entry[][]): Library {
    const entriesMap = new Map<string, Entry>();
    const citekeyCounts = new Map<string, number>();

    // First pass: count citekeys
    for (const entries of results) {
      for (const entry of entries) {
        citekeyCounts.set(entry.id, (citekeyCounts.get(entry.id) || 0) + 1);
      }
    }

    for (const entries of results) {
      for (const entry of entries) {
        if (citekeyCounts.get(entry.id)! > 1) {
          // Duplicate detected
          const compositeKey = `${entry.id}@${entry._sourceDatabase}`;
          entry._compositeCitekey = compositeKey;
          // We keep the original ID for display/search but store it under composite key in the map if needed
          // But wait, if we change the ID, it changes how it's referenced.
          // The requirement says: "If records have same names but different citekeys - they are different records. If records are completely identical (same citekey and content), form a composite key: <citekey>@<database_name>."

          // Actually, if citekeys are same, we MUST distinguish them in the library map.
          // So we should use the composite key as the map key.
          // And maybe update the entry.id to be the composite key?
          // Or keep entry.id as original and use a different property for map key?
          // The Library class uses map key as lookup.

          // Let's clone the entry to avoid modifying the original if it's shared (though it shouldn't be)
          // And update its ID to the composite key so it's unique in the system.
          // But we want to preserve the original citekey for display if possible.
          // The Entry interface has 'id'.

          // Let's update the ID to composite key.
          // But we need to store the original citekey somewhere?
          // The 'id' is used for @citekey.

          // If the user wants to cite it, they will use the composite key?
          // "User chooses which database to connect the record from."
          // This implies the user selects one, and that selection has a unique ID.

          // So yes, update ID to composite key.
          entry.id = compositeKey;
          // entry._compositeCitekey is already set.
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
      // Create sources from settings
      this.sources = this.settings.databases.map((db, index) => {
        return new LocalFileSource(
          `source-${index}`,
          db.path,
          db.type,
          this.loadWorker,
          this.vaultAdapter,
        );
      });

      // Load from all sources in parallel
      const loadPromises = this.sources.map(async (source, index) => {
        try {
          console.debug(`LibraryService: Loading from source ${source.id}`);
          const entries = await source.load();
          console.debug(
            `LibraryService: Loaded ${entries.length} entries from ${source.id}`,
          );
          // Tag entries with source database name
          const dbName = this.settings.databases[index].name;
          entries.forEach((entry) => {
            entry._sourceDatabase = dbName;
          });
          return entries;
        } catch (error) {
          console.error(
            `LibraryService: Error loading from source ${source.id}:`,
            error,
          );
          return error instanceof Error ? error : new Error(String(error));
        }
      });

      // Add 10s timeout
      let timeoutId: number = 0;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('Timeout loading citation database')),
          10000,
        );
      });

      const results = await Promise.race([
        Promise.all(loadPromises),
        timeoutPromise,
      ]);

      // Clear the timeout if the race completed before the timeout fired
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (signal.aborted) return null;

      // Check if all sources failed
      const successfulResults = results.filter((r): r is Entry[] =>
        Array.isArray(r),
      );
      const errors = results.filter((r): r is Error => r instanceof Error);

      if (successfulResults.length === 0 && errors.length > 0) {
        // All sources failed, throw the first error
        throw errors[0];
      }

      // Merge results and handle duplicates
      this.library = this.mergeEntries(successfulResults);

      // Build search index
      console.debug('Citation plugin: Building search index');
      this.searchService.buildIndex(Object.values(this.library.entries));

      const totalEntries = successfulResults.reduce(
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

      // Re-init watcher since sources might have changed
      this.initWatcher();

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
  };

  private handleErrorRetry(): void {
    if (this.retryCount < 5) {
      const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
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
    // Dispose existing watchers first
    this.sources.forEach((s) => s.dispose());

    // Re-create sources if they don't exist (e.g. initial load)
    // Actually load() creates sources. initWatcher should be called after load().

    if (this.sources.length === 0) {
      // If no sources, maybe we haven't loaded yet?
      // But we can create sources just for watching?
      // Better to rely on load() to populate sources.
      return;
    }

    // Set up watchers for all sources
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
    }, 1000); // 1s debounce
  }

  /**
   * Clean up all resources
   */
  dispose = (): void => {
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
  };

  /**
   * Returns true iff the library is currently being loaded on the worker thread.
   */
  get isLibraryLoading(): boolean {
    return this.state.status === LoadingStatus.Loading;
  }
}
