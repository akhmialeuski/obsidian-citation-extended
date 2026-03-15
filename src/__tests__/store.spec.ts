import { LibraryStore } from '../library/library-store';
import { LoadingStatus } from '../library/library-state';

describe('LibraryStore', () => {
  let store: LibraryStore;

  beforeEach(() => {
    store = new LibraryStore();
  });

  afterEach(() => {
    store.dispose();
  });

  describe('getState()', () => {
    it('should return initial Idle state', () => {
      expect(store.getState()).toEqual({ status: LoadingStatus.Idle });
    });

    it('should return a copy of the state (no mutation)', () => {
      const state1 = store.getState();
      const state2 = store.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe('setState()', () => {
    it('should merge partial state into current state', () => {
      store.setState({ status: LoadingStatus.Loading });
      expect(store.getState().status).toBe(LoadingStatus.Loading);
    });

    it('should preserve existing fields when merging', () => {
      const lastLoaded = new Date();
      store.setState({ status: LoadingStatus.Success, lastLoaded });
      store.setState({ progress: { current: 10, total: 10 } });

      const state = store.getState();
      expect(state.status).toBe(LoadingStatus.Success);
      expect(state.lastLoaded).toBe(lastLoaded);
      expect(state.progress).toEqual({ current: 10, total: 10 });
    });
  });

  describe('subscribe()', () => {
    it('should call subscriber immediately with current state', () => {
      const subscriber = jest.fn();
      store.subscribe(subscriber);

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({ status: LoadingStatus.Idle }),
      );
    });

    it('should notify subscribers on setState', () => {
      const subscriber = jest.fn();
      store.subscribe(subscriber);
      subscriber.mockClear();

      store.setState({ status: LoadingStatus.Loading });

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({ status: LoadingStatus.Loading }),
      );
    });

    it('should notify multiple subscribers', () => {
      const sub1 = jest.fn();
      const sub2 = jest.fn();
      store.subscribe(sub1);
      store.subscribe(sub2);
      sub1.mockClear();
      sub2.mockClear();

      store.setState({ status: LoadingStatus.Success });

      expect(sub1).toHaveBeenCalledTimes(1);
      expect(sub2).toHaveBeenCalledTimes(1);
    });

    it('should return an unsubscribe function', () => {
      const subscriber = jest.fn();
      const unsubscribe = store.subscribe(subscriber);
      subscriber.mockClear();

      unsubscribe();
      store.setState({ status: LoadingStatus.Error });

      expect(subscriber).not.toHaveBeenCalled();
    });
  });

  describe('dispose()', () => {
    it('should clear all subscribers', () => {
      const subscriber = jest.fn();
      store.subscribe(subscriber);
      subscriber.mockClear();

      store.dispose();
      store.setState({ status: LoadingStatus.Loading });

      expect(subscriber).not.toHaveBeenCalled();
    });
  });
});
