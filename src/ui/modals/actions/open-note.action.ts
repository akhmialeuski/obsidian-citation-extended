import { Notice } from 'obsidian';
import { Entry } from '../../../core';
import CitationPlugin from '../../../main';
import { SearchAction } from './search-action';

export class OpenNoteAction implements SearchAction {
  name = 'Open literature note';
  selectedText?: string;
  constructor(private plugin: CitationPlugin) {}

  onChoose = async (item: Entry, evt: MouseEvent | KeyboardEvent) => {
    if (evt instanceof MouseEvent || evt.key == 'Enter') {
      const newPane = evt instanceof KeyboardEvent && evt.ctrlKey;
      await this.plugin.editorActions.openLiteratureNote(item.id, newPane);
    } else if (evt.key == 'Tab') {
      if (evt.shiftKey) {
        const files = item.files || [];
        const pdfPaths = files.filter((path) =>
          path.toLowerCase().endsWith('pdf'),
        );
        if (pdfPaths.length == 0) {
          new Notice('This reference has no associated PDF files.');
        } else {
          open(`file://${pdfPaths[0]}`);
        }
      } else {
        open(item.zoteroSelectURI);
      }
    }
  };

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
}
