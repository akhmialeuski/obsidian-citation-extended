import { LoadingStatus, LibraryState } from './library-state';

/** Callback invoked whenever the store state changes. */
export type StoreSubscriber<T> = (state: T) => void;

/**
 * Reactive store that wraps LibraryState with publish/subscribe semantics.
 * Replaces direct event triggers for state management.
 */
export class LibraryStore {
  private state: LibraryState = { status: LoadingStatus.Idle, parseErrors: [] };
  private subscribers = new Set<StoreSubscriber<LibraryState>>();

  getState(): LibraryState {
    return { ...this.state };
  }

  setState(partial: Partial<LibraryState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  subscribe(fn: StoreSubscriber<LibraryState>): () => void {
    this.subscribers.add(fn);
    fn(this.getState());
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const fn of this.subscribers) {
      fn(snapshot);
    }
  }

  dispose(): void {
    this.subscribers.clear();
  }
}
