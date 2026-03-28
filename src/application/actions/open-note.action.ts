import {
  Entry,
  LiteratureNoteNotFoundError,
  LibraryNotReadyError,
} from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

export class OpenNoteAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor = {
    id: 'open-literature-note',
    name: 'Open literature note',
    icon: 'book-open',
    showInCommandPalette: true,
    showInContextMenu: true,
    requiresEditor: false,
  };

  onChoose = async (item: Entry, evt: MouseEvent | KeyboardEvent) => {
    if (evt instanceof MouseEvent || evt.key == 'Enter') {
      const newPane = evt instanceof KeyboardEvent && evt.ctrlKey;
      await this.openNote(item.id, newPane, this.selectedText);
    } else if (evt.key == 'Tab') {
      if (evt.shiftKey) {
        const files = item.files || [];
        const pdfPaths = files.filter((path) =>
          path.toLowerCase().endsWith('pdf'),
        );
        if (pdfPaths.length == 0) {
          this.ctx.platform.notifications.show(
            'This reference has no associated PDF files.',
          );
        } else {
          open(`file://${pdfPaths[0]}`);
        }
      } else {
        open(item.zoteroSelectURI);
      }
    }
  };

  /** Direct execution for context menu — opens note for a known citekey. */
  async execute(invocation: ActionInvocationContext): Promise<void> {
    if (!invocation.citekey) return;
    await this.openNote(invocation.citekey, false);
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to open literature note' },
      { command: 'ctrl ↵', purpose: 'to open literature note in a new pane' },
      { command: 'tab', purpose: 'open in Zotero' },
      { command: 'shift tab', purpose: 'open PDF' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }

  private async openNote(
    citekey: string,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void> {
    const library = this.ctx.libraryService.library;
    if (!library) {
      this.ctx.platform.notifications.show(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.ctx.citationService.getEntry(citekey);
    if (!entryResult.ok) {
      this.ctx.platform.notifications.show(entryResult.error.message);
      return;
    }

    try {
      await this.ctx.noteService.openLiteratureNote(
        citekey,
        library,
        newPane,
        selectedText,
      );
    } catch (e) {
      if (e instanceof LiteratureNoteNotFoundError) {
        this.ctx.platform.notifications.show(e.message);
      } else {
        console.error('Failed to open literature note:', e);
        this.ctx.platform.notifications.show(
          'Unable to open literature note. Please check that the literature note folder exists.',
        );
      }
    }
  }
}
