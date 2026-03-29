import { Entry } from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

/**
 * Collects multiple citekeys and inserts them as a combined citation
 * in the format [@key1; @key2; @key3] when the modal is dismissed.
 *
 * Each Enter adds the selected entry to the accumulator (the modal
 * stays open).  Press Esc to finalize and insert.
 */
export class InsertMultiCitationAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor = {
    id: 'insert-multiple-citations',
    name: 'Insert multiple citations',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: true,
  };

  private collectedKeys: string[] = [];
  keepOpen = true;

  onChoose = (item: Entry, evt: MouseEvent | KeyboardEvent) => {
    if (!this.collectedKeys.includes(item.id)) {
      this.collectedKeys.push(item.id);
    }

    // Shift+Enter finalizes and inserts immediately
    if (evt instanceof KeyboardEvent && evt.shiftKey) {
      this.keepOpen = false;
      this.insertCollected();
    }
  };

  onClose(): void {
    if (this.collectedKeys.length > 0) {
      this.insertCollected();
    }
    // Reset for next invocation — action instance is reused across modal sessions
    this.keepOpen = true;
    this.collectedKeys = [];
  }

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    // Modal-based — execute is a no-op
  }

  private insertCollected(): void {
    if (this.collectedKeys.length === 0) return;

    const editor = this.ctx.platform.workspace.getActiveEditor();
    if (!editor) {
      this.ctx.platform.notifications.show('No active editor found');
      this.collectedKeys = [];
      return;
    }

    const citation =
      '[' + this.collectedKeys.map((k) => `@${k}`).join('; ') + ']';
    const cursor = editor.getCursor();
    editor.replaceRange(citation, cursor);
    editor.setCursor({
      line: cursor.line,
      ch: cursor.ch + citation.length,
    });

    this.collectedKeys = [];
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to add citation to list' },
      { command: 'shift ↵', purpose: 'to add and insert immediately' },
      { command: 'esc', purpose: 'to insert collected citations' },
    ];
  }
}
