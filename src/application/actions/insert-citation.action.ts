import { Entry } from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

/**
 * Inserts a Markdown citation (e.g. `[@citekey]`) at the current cursor position.
 *
 * Handles multi-line content by recalculating cursor position after insertion.
 * Shift+Enter inserts the secondary/alternative citation format.
 * Optionally auto-creates a literature note on citation insertion.
 */
export class InsertCitationAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor = {
    id: 'insert-markdown-citation',
    name: 'Insert Markdown citation',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: true,
  };

  onChoose = (item: Entry, evt: MouseEvent | KeyboardEvent) => {
    const isAlternative = evt instanceof KeyboardEvent && evt.shiftKey;
    const editor = this.ctx.platform.workspace.getActiveEditor();
    if (!editor) {
      this.ctx.platform.notifications.show('No active editor found');
      return;
    }

    const citationResult = this.ctx.citationService.getMarkdownCitation(
      item.id,
      isAlternative,
      this.selectedText,
    );

    if (!citationResult.ok) {
      this.ctx.platform.notifications.show(citationResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(citationResult.value, cursor);

    // Move cursor to the end of the inserted text, accounting for multi-line content:
    // single-line → offset from original cursor; multi-line → start of last line.
    const lines = citationResult.value.split('\n');
    const lastLineLength = lines[lines.length - 1].length;
    const newLine = cursor.line + lines.length - 1;
    const newCh =
      lines.length === 1 ? cursor.ch + lastLineLength : lastLineLength;
    editor.setCursor({ line: newLine, ch: newCh });

    if (this.ctx.settings.autoCreateNoteOnCitation) {
      const library = this.ctx.libraryService.library;
      if (library) {
        void this.ctx.noteService
          .getOrCreateLiteratureNoteFile(item.id, library, this.selectedText)
          .catch((e: unknown) =>
            console.warn('Failed to auto-create literature note:', e),
          );
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_invocation: ActionInvocationContext): Promise<void> {
    // Modal-based — execute is a no-op; real work happens in onChoose
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert Markdown citation' },
      { command: 'shift ↵', purpose: 'to insert secondary Markdown citation' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
