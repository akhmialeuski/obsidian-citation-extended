import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { LoadingStatus, LibraryState } from '../library-state';
import {
    InsertCitationModal,
    InsertNoteLinkModal,
    InsertNoteContentModal,
    OpenNoteModal,
} from '../modals';
import CitationPlugin from '../main';

export class UIService {
    private statusBarItem: HTMLElement;

    constructor(
        private app: App,
        private plugin: CitationPlugin
    ) {
        this.statusBarItem = this.plugin.addStatusBarItem();
    }

    init(): void {
        this.plugin.events.on('library-state-changed', (state: LibraryState) => {
            this.updateStatusBar(state);
        });

        // Initial state
        this.updateStatusBar(this.plugin.libraryService.state);
        this.registerCommands();
    }

    private updateStatusBar(state: LibraryState): void {
        let text = '';
        let cls = '';

        switch (state.status) {
            case LoadingStatus.Idle:
                text = 'Citations: Idle';
                break;
            case LoadingStatus.Loading:
                text = 'Citations: Loading...';
                break;
            case LoadingStatus.Success:
                text = `Citations: ${state.progress?.current || 0} entries`;
                break;
            case LoadingStatus.Error:
                text = 'Citations: Error';
                cls = 'mod-error';
                break;
        }

        this.statusBarItem.setText(text);
        if (cls) {
            this.statusBarItem.addClass(cls);
        } else {
            this.statusBarItem.removeClass('mod-error');
        }
    }

    registerCommands(): void {
        this.plugin.addCommand({
            id: 'open-literature-note',
            name: 'Open literature note',
            hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'o' }],
            callback: () => {
                const modal = new OpenNoteModal(this.app, this.plugin);
                modal.open();
            },
        });

        this.plugin.addCommand({
            id: 'update-bib-data',
            name: 'Refresh citation database',
            hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'r' }],
            callback: () => {
                this.plugin.libraryService.load();
            },
        });

        this.plugin.addCommand({
            id: 'insert-citation',
            name: 'Insert literature note link',
            hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'e' }],
            callback: () => {
                const modal = new InsertNoteLinkModal(this.app, this.plugin);
                modal.open();
            },
        });

        this.plugin.addCommand({
            id: 'insert-literature-note-content',
            name: 'Insert literature note content in the current pane',
            callback: () => {
                const modal = new InsertNoteContentModal(this.app, this.plugin);
                modal.open();
            },
        });

        this.plugin.addCommand({
            id: 'insert-markdown-citation',
            name: 'Insert Markdown citation',
            callback: () => {
                const modal = new InsertCitationModal(this.app, this.plugin);
                modal.open();
            },
        });
    }
}
