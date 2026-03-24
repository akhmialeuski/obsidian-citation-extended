import { CitationSearchModal } from '../ui/modals/citation-search-modal';
import { InsertCitationAction } from '../ui/modals/actions/insert-citation.action';
import { InsertSubsequentCitationAction } from '../ui/modals/actions/insert-subsequent-citation.action';
import { InsertMultiCitationAction } from '../ui/modals/actions/insert-multi-citation.action';
import { InsertNoteLinkAction } from '../ui/modals/actions/insert-note-link.action';
import { InsertNoteContentAction } from '../ui/modals/actions/insert-note-content.action';
import { OpenNoteAction } from '../ui/modals/actions/open-note.action';
import { SearchAction } from '../ui/modals/actions/search-action';
import CitationPlugin from '../main';

/**
 * Encapsulates all Obsidian command registrations for the citation plugin.
 * Extracted from UIService to keep command definitions in a dedicated module.
 */
export class CommandRegistry {
  constructor(private plugin: CitationPlugin) {}

  /**
   * Register all plugin commands with Obsidian.
   */
  registerAll(): void {
    this.plugin.addCommand({
      id: 'open-literature-note',
      name: 'Open literature note',

      callback: () => {
        this.openSearchModal(new OpenNoteAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'update-bib-data',
      name: 'Refresh citation database',

      callback: () => {
        void this.plugin.libraryService.load();
      },
    });

    // Use `callback` instead of `editorCallback` so that insert commands
    // are available in Canvas text nodes, Lineage views, and other
    // non-standard editor contexts.  The plugin methods already null-guard
    // the editor and show a Notice when none is found.
    this.plugin.addCommand({
      id: 'insert-citation',
      name: 'Insert literature note link',

      callback: () => {
        this.openSearchModal(new InsertNoteLinkAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'insert-literature-note-content',
      name: 'Insert literature note content in the current pane',
      callback: () => {
        this.openSearchModal(new InsertNoteContentAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'insert-markdown-citation',
      name: 'Insert Markdown citation',
      callback: () => {
        this.openSearchModal(new InsertCitationAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'open-note-at-cursor',
      name: 'Open literature note for citation at cursor',
      callback: () => {
        void this.plugin.editorActions.openNoteAtCursor();
      },
    });

    this.plugin.addCommand({
      id: 'insert-subsequent-citation',
      name: 'Insert subsequent citation',
      callback: () => {
        this.openSearchModal(new InsertSubsequentCitationAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'insert-multiple-citations',
      name: 'Insert multiple citations',
      callback: () => {
        this.openSearchModal(new InsertMultiCitationAction(this.plugin));
      },
    });
  }

  /**
   * Returns the currently selected text from the active editor, if any.
   */
  private getSelectedText(): string {
    const editor = this.plugin.platform.workspace.getActiveEditor();
    return editor?.getSelection() ?? '';
  }

  /**
   * Opens a citation search modal, injecting the current editor selection
   * into the action so templates can use {{selectedText}} and the search
   * input is pre-filled.
   */
  private openSearchModal(action: SearchAction): void {
    action.selectedText = this.getSelectedText();
    const modal = new CitationSearchModal(this.plugin.app, this.plugin, action);
    modal.open();
  }
}
