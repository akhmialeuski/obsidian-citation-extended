import { Entry } from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

/**
 * Appends a citation to an existing Pandoc-style citation block (e.g. `[@a; @b]`).
 *
 * When the cursor is inside a `[@...]` block, the new citekey is appended
 * with a semicolon separator. If no block is found at the cursor, falls back
 * to inserting a standalone citation.
 */
export class InsertSubsequentCitationAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor = {
    id: 'insert-subsequent-citation',
    name: 'Insert subsequent citation',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: true,
  };

  onChoose = (item: Entry) => {
    const editor = this.ctx.platform.workspace.getActiveEditor();
    if (!editor) {
      this.ctx.platform.notifications.show('No active editor found');
      return;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Match Pandoc citation blocks: [@key] or [@key1; @key2; ...].
    // Uses global flag to iterate all blocks on the line and find the one containing the cursor.
    const citationPattern = /\[(@[^\]]+)\]/g;
    let match;
    while ((match = citationPattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (cursor.ch >= start && cursor.ch <= end) {
        const insertPos = { line: cursor.line, ch: end - 1 };
        editor.replaceRange(`; @${item.id}`, insertPos);
        editor.setCursor({
          line: cursor.line,
          ch: insertPos.ch + `; @${item.id}`.length,
        });
        return;
      }
    }

    // No existing citation at cursor — insert as normal citation
    const citationResult = this.ctx.citationService.getMarkdownCitation(
      item.id,
      false,
    );
    if (!citationResult.ok) {
      this.ctx.platform.notifications.show(citationResult.error.message);
      return;
    }

    const insertCursor = editor.getCursor();
    editor.replaceRange(citationResult.value, insertCursor);

    const lines = citationResult.value.split('\n');
    const lastLineLength = lines[lines.length - 1].length;
    const newLine = insertCursor.line + lines.length - 1;
    const newCh =
      lines.length === 1 ? insertCursor.ch + lastLineLength : lastLineLength;
    editor.setCursor({ line: newLine, ch: newCh });
  };

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    // Modal-based — execute is a no-op
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to append citation to existing' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
