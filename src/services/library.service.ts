import { FileSystemAdapter } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { CitationsPluginSettings } from '../settings';
import {
    Entry,
    EntryData,
    EntryBibLaTeXAdapter,
    EntryCSLAdapter,
    IIndexable,
    Library,
} from '../types';
import {
    Notifier,
    WorkerManager,
} from '../util';
import { LoadingStatus, LibraryState } from '../library-state';
import CitationEvents from '../events';
import LoadWorker from 'web-worker:../worker';

export class LibraryService {
    library: Library;
    private loadWorker = new WorkerManager(new LoadWorker());
    private abortController: AbortController | null = null;
    private watcher: chokidar.FSWatcher | null = null;
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
        private vaultAdapter: FileSystemAdapter | null // To resolve path
    ) { }

    /**
     * Resolve a provided library path, allowing for relative paths rooted at
     * the vault directory.
     */
    resolveLibraryPath(rawPath: string): string {
        const vaultRoot =
            this.vaultAdapter instanceof FileSystemAdapter
                ? this.vaultAdapter.getBasePath()
                : '/';
        return path.resolve(vaultRoot, rawPath);
    }

    private setState(newState: Partial<LibraryState>) {
        this.state = { ...this.state, ...newState };
        this.events.trigger('library-state-changed', this.state);
    }

    async load(isRetry = false): Promise<Library | null> {
        if (!this.settings.citationExportPath) {
            console.warn(
                'Citations plugin: citation export path is not set. Please update plugin settings.',
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
        console.debug('Citation plugin: Reloading library');
        this.events.trigger('library-load-start');

        const filePath = this.resolveLibraryPath(this.settings.citationExportPath);

        try {
            // Integrity check: File exists and not empty
            const stats = await fs.promises.stat(filePath);
            if (!stats || stats.size === 0) {
                throw new Error('Library file is empty or does not exist');
            }

            const buffer = await FileSystemAdapter.readLocalFile(filePath);
            if (signal.aborted) return null;

            // Decode file as UTF-8.
            const dataView = new DataView(buffer);
            const decoder = new TextDecoder('utf8');
            const value = decoder.decode(dataView);

            const entries: EntryData[] = await this.loadWorker.post({
                databaseRaw: value,
                databaseType: this.settings.citationExportFormat,
            }, signal);

            if (signal.aborted) return null;

            let adapter: new (data: EntryData) => Entry;
            let idKey: string;

            switch (this.settings.citationExportFormat) {
                case 'biblatex':
                    adapter = EntryBibLaTeXAdapter;
                    idKey = 'key';
                    break;
                case 'csl-json':
                    adapter = EntryCSLAdapter;
                    idKey = 'id';
                    break;
            }

            this.library = new Library(
                Object.fromEntries(
                    entries.map((e) => [(e as IIndexable)[idKey], new adapter(e)]),
                ),
            );

            this.setState({
                status: LoadingStatus.Success,
                lastLoaded: new Date(),
                progress: { current: this.library.size, total: this.library.size }
            });

            console.debug(
                `Citation plugin: successfully loaded library with ${this.library.size} entries.`,
            );

            this.events.trigger('library-load-complete');
            this.loadErrorNotifier.hide();
            this.retryCount = 0;

            return this.library;

        } catch (e) {
            if (signal.aborted) return null;

            console.error('Citation plugin: Error loading library', e);
            this.setState({ status: LoadingStatus.Error, error: e });
            this.loadErrorNotifier.show();

            this.handleErrorRetry();
            return null;
        } finally {
            if (this.abortController?.signal === signal) {
                this.abortController = null;
            }
        }
    }

    private handleErrorRetry() {
        if (this.retryCount < 5) {
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
            this.retryCount++;
            console.log(`Citation plugin: Retrying load in ${delay}ms (Attempt ${this.retryCount})`);
            this.retryTimer = window.setTimeout(() => {
                this.load(true);
            }, delay);
        }
    }

    initWatcher() {
        if (this.watcher) {
            this.watcher.close();
        }

        if (!this.settings.citationExportPath) return;

        const filePath = this.resolveLibraryPath(this.settings.citationExportPath);

        // Watcher options
        const watchOptions = {
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            },
            ignoreInitial: true
        };

        this.watcher = chokidar.watch(filePath, watchOptions);

        this.watcher.on('change', () => {
            this.triggerLoadWithDebounce();
        });
        this.watcher.on('add', () => {
            this.triggerLoadWithDebounce();
        });
    }

    private triggerLoadWithDebounce() {
        if (this.loadDebounceTimer) {
            window.clearTimeout(this.loadDebounceTimer);
        }

        this.loadDebounceTimer = window.setTimeout(() => {
            this.load();
        }, 1000); // 1s debounce
    }

    /**
     * Returns true iff the library is currently being loaded on the worker thread.
     */
    get isLibraryLoading(): boolean {
        return this.state.status === LoadingStatus.Loading;
    }
}

