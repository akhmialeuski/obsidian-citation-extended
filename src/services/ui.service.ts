import { App, Plugin, Editor, MarkdownView } from 'obsidian';
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
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const modal = new InsertNoteLinkModal(this.app, this.plugin);
                modal.open();
            },
        });

        this.plugin.addCommand({
            id: 'insert-literature-note-content',
            name: 'Insert literature note content in the current pane',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const modal = new InsertNoteContentModal(this.app, this.plugin);
                modal.open();
            },
        });

        this.plugin.addCommand({
            id: 'insert-markdown-citation',
            name: 'Insert Markdown citation',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const modal = new InsertCitationModal(this.app, this.plugin);
                modal.open();
            },
        });
    }
}
