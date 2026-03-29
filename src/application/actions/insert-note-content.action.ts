import { Entry } from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

/**
 * Inserts rendered literature note content into the active editor at the cursor.
 *
 * The content is generated from the literature note template for the selected
 * entry, allowing users to inline note content without creating a separate file.
 */
export class InsertNoteContentAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor = {
    id: 'insert-literature-note-content',
    name: 'Insert literature note content in the current pane',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: true,
  };

  onChoose = async (item: Entry) => {
    const editor = this.ctx.platform.workspace.getActiveEditor();
    if (!editor) {
      this.ctx.platform.notifications.show('No active editor found');
      return;
    }

    const contentResult =
      await this.ctx.citationService.getInitialContentForCitekey(
        item.id,
        this.selectedText,
      );
    if (!contentResult.ok) {
      this.ctx.platform.notifications.show(contentResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(contentResult.value, cursor);

    const lines = contentResult.value.split('\n');
    const lastLineLength = lines[lines.length - 1].length;
    const newLine = cursor.line + lines.length - 1;
    const newCh =
      lines.length === 1 ? cursor.ch + lastLineLength : lastLineLength;
    editor.setCursor({ line: newLine, ch: newCh });
  };

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    // Modal-based — execute is a no-op
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      {
        command: '↵',
        purpose: 'to insert literature note content in active pane',
      },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
