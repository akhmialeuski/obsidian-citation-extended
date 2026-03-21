import { Entry } from '../../../core';
import CitationPlugin from '../../../main';
import { SearchAction } from './search-action';

export class InsertNoteLinkAction implements SearchAction {
  name = 'Insert literature note link';
  selectedText?: string;
  constructor(private plugin: CitationPlugin) {}

  onChoose = async (item: Entry) => {
    await this.plugin.editorActions.insertLiteratureNoteLink(item.id);
  };

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert literature note reference' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
