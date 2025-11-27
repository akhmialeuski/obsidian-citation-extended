import { FileSystemAdapter } from 'obsidian';
import * as path from 'path';
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
    WorkerManagerBlocked,
} from '../util';
import CitationEvents from '../events';
import LoadWorker from 'web-worker:../worker';

export class LibraryService {
    library: Library;
    private loadWorker = new WorkerManager(new LoadWorker(), {
        blockingChannel: true,
    });

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

    async load(): Promise<Library> {
        console.debug('Citation plugin: Reloading library');
        if (this.settings.citationExportPath) {
            const filePath = this.resolveLibraryPath(
                this.settings.citationExportPath,
            );

            // Unload current library.
            this.events.trigger('library-load-start');
            this.library = null;

            return FileSystemAdapter.readLocalFile(filePath)
                .then((buffer) => {
                    // If there is a remaining error message, hide it
                    this.loadErrorNotifier.hide();

                    // Decode file as UTF-8.
                    const dataView = new DataView(buffer);
                    const decoder = new TextDecoder('utf8');
                    const value = decoder.decode(dataView);

                    return this.loadWorker.post({
                        databaseRaw: value,
                        databaseType: this.settings.citationExportFormat,
                    });
                })
                .then((entries: EntryData[]) => {
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
                    console.debug(
                        `Citation plugin: successfully loaded library with ${this.library.size} entries.`,
                    );

                    this.events.trigger('library-load-complete');

                    return this.library;
                })
                .catch((e) => {
                    if (e instanceof WorkerManagerBlocked) {
                        // Silently catch WorkerManager error, which will be thrown if the
                        // library is already being loaded
                        return;
                    }

                    console.error(e);
                    this.loadErrorNotifier.show();

                    return null;
                });
        } else {
            console.warn(
                'Citations plugin: citation export path is not set. Please update plugin settings.',
            );
        }
    }

    /**
     * Returns true iff the library is currently being loaded on the worker thread.
     */
    get isLibraryLoading(): boolean {
        return this.loadWorker.blocked;
    }
}
