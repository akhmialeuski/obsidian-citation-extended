import { Entry } from '../../../core';
import CitationPlugin from '../../../main';
import { SearchAction } from './search-action';

export class InsertNoteContentAction implements SearchAction {
  name = 'Insert literature note content';
  constructor(private plugin: CitationPlugin) {}

  onChoose = (item: Entry) => {
    this.plugin.editorActions.insertLiteratureNoteContent(item.id);
  };

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
