import { Entry } from '../../../core';

export interface SearchAction {
  name: string;
  selectedText?: string;
  /** When true, the modal stays open after each selection (multi-select mode). */
  keepOpen?: boolean;
  onChoose(item: Entry, evt: MouseEvent | KeyboardEvent): Promise<void> | void;
  /** Called when the modal is closed — use for finalization in multi-select actions. */
  onClose?(): void;
  renderItem?(item: Entry, el: HTMLElement): void;
  getInstructions?(): { command: string; purpose: string }[];
}
