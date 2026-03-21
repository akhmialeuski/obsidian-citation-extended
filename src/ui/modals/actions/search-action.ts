import { Entry } from '../../../core';

export interface SearchAction {
  name: string;
  selectedText?: string;
  onChoose(item: Entry, evt: MouseEvent | KeyboardEvent): Promise<void> | void;
  renderItem?(item: Entry, el: HTMLElement): void;
  getInstructions?(): { command: string; purpose: string }[];
}
