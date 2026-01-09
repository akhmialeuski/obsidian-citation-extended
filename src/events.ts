/**
 * Defines an event manager for the citations plugin.
 */

import { Events, EventRef } from 'obsidian';
import { LibraryState } from './library-state';

/**
 * Generic callback type that matches all overload signatures.
 * Using a union of the specific callback types ensures type safety.
 */
type CitationEventCallback = (() => void) | ((state: LibraryState) => void);

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
  on(name: string, callback: CitationEventCallback, ctx?: unknown): EventRef {
    // Cast callback to be compatible with the parent Events.on() signature
    return super.on(name, callback as (...data: unknown[]) => unknown, ctx);
  }

  trigger(name: 'library-load-start'): void;
  trigger(name: 'library-load-complete'): void;
  trigger(name: 'library-state-changed', state: LibraryState): void;
  trigger(name: string, ...data: unknown[]): void {
    super.trigger(name, ...data);
  }
}
