import { Entry } from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

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

    // Find the [@...] citation block that contains the cursor
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
