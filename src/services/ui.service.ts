import { App, Plugin } from 'obsidian';
import {
    InsertCitationModal,
    InsertNoteLinkModal,
    InsertNoteContentModal,
    OpenNoteModal,
} from '../modals';
import CitationPlugin from '../main';

export class UIService {
    constructor(
        private app: App,
        private plugin: CitationPlugin
    ) { }

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
