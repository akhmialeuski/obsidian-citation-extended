import { Entry } from '../../../core';
import CitationPlugin from '../../../main';
import { SearchAction } from './search-action';

export class InsertSubsequentCitationAction implements SearchAction {
  name = 'Insert subsequent citation';
  selectedText?: string;
  constructor(private plugin: CitationPlugin) {}

  onChoose = (item: Entry) => {
    void this.plugin.editorActions.insertSubsequentCitation(item.id);
  };

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to append citation to existing' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
