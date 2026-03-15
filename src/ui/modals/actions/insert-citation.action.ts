import { Entry } from '../../../core';
import CitationPlugin from '../../../main';
import { SearchAction } from './search-action';

export class InsertCitationAction implements SearchAction {
  name = 'Insert citation';
  constructor(private plugin: CitationPlugin) {}

  onChoose = (item: Entry, evt: MouseEvent | KeyboardEvent) => {
    const isAlternative = evt instanceof KeyboardEvent && evt.shiftKey;
    this.plugin.editorActions.insertMarkdownCitation(item.id, isAlternative);
  };

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert Markdown citation' },
      { command: 'shift ↵', purpose: 'to insert secondary Markdown citation' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
