import {
  ApplicationAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';
import { extractCitekeyAtCursor } from '../citekey-extractor';
import { LibraryNotReadyError, LiteratureNoteNotFoundError } from '../../core';

/**
 * Opens the literature note corresponding to the citation under the cursor.
 *
 * Extracts the citekey from the current cursor position using
 * {@link extractCitekeyAtCursor}, then navigates to the matching note.
 */
export class OpenNoteAtCursorAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'open-note-at-cursor',
    name: 'Open literature note for citation at cursor',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: true,
  };

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    const editor = this.ctx.platform.workspace.getActiveEditor();
    if (!editor) {
      this.ctx.platform.notifications.show('No active editor found');
      return;
    }

    const citekey = extractCitekeyAtCursor(editor);
    if (!citekey) {
      this.ctx.platform.notifications.show(
        'No citation found at cursor position.',
      );
      return;
    }

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
      await this.ctx.noteService.openLiteratureNote(citekey, library, false);
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
