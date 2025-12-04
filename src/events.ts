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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Function is required to match overload signatures
    callback: Function,
    ctx?: unknown,
  ): EventRef {
    return super.on(name, callback as (...args: unknown[]) => unknown, ctx);
  }

  trigger(name: 'library-load-start'): void;
  trigger(name: 'library-load-complete'): void;
  trigger(name: 'library-state-changed', state: LibraryState): void;
  trigger(name: string, ...data: unknown[]): void {
    super.trigger(name, ...data);
  }
}
