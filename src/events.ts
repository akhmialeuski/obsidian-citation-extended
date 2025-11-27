/**
 * Defines an event manager for the citations plugin.
 */

import { Events, EventRef } from 'obsidian';
import { LibraryState } from './library-state';

export default class CitationEvents extends Events {
  on(name: 'library-load-start', callback: () => void, ctx?: unknown): EventRef;
  on(
    name: 'library-load-complete',
    callback: () => void,
    ctx?: unknown,
  ): EventRef;
  on(
    name: 'library-state-changed',
    callback: (state: LibraryState) => void,
    ctx?: unknown,
  ): EventRef;
  on(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (...data: any[]) => void,
    ctx?: unknown,
  ): EventRef {
    return super.on(name, callback, ctx);
  }

  trigger(name: 'library-load-start'): void;
  trigger(name: 'library-load-complete'): void;
  trigger(name: 'library-state-changed', state: LibraryState): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trigger(name: string, ...data: any[]): void {
    super.trigger(name, ...data);
  }
}
