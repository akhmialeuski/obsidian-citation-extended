import { Entry } from '../../../core';
import CitationPlugin from '../../../main';
import { SearchAction } from './search-action';

/**
 * Collects multiple citekeys and inserts them as a combined citation
 * in the format [@key1; @key2; @key3] when the modal is dismissed.
 *
 * Each Enter adds the selected entry to the accumulator (the modal
 * stays open).  Press Esc to finalize and insert.
 */
export class InsertMultiCitationAction implements SearchAction {
  name = 'Insert multiple citations (Enter = add, Esc = insert)';
  selectedText?: string;

  private collectedKeys: string[] = [];

  keepOpen = true;

  constructor(private plugin: CitationPlugin) {}

  onChoose = (item: Entry, evt: MouseEvent | KeyboardEvent) => {
    // Avoid duplicates
    if (!this.collectedKeys.includes(item.id)) {
      this.collectedKeys.push(item.id);
    }

    // Shift+Enter finalizes and inserts immediately
    if (evt instanceof KeyboardEvent && evt.shiftKey) {
      this.insertCollected();
    }
  };

  /**
   * Called by the modal when it closes.  If there are accumulated keys
   * that haven't been inserted yet, insert them now.
   */
  onClose(): void {
    if (this.collectedKeys.length > 0) {
      this.insertCollected();
    }
  }

  private insertCollected(): void {
    if (this.collectedKeys.length === 0) return;

    const editor = this.plugin.platform.workspace.getActiveEditor();
    if (!editor) {
      this.plugin.platform.notifications.show('No active editor found');
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
