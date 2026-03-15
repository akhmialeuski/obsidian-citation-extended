/** @jest-environment jsdom */
import { UIService } from '../../src/services/ui.service';
import { LoadingStatus, LibraryState } from '../../src/library/library-state';
import { Notice } from 'obsidian';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    Notice: jest.fn(),
    SuggestModal: class {
      open() {}
      close() {}
    },
  }),
  { virtual: true },
);

function makePlugin(initialState: LibraryState) {
  let subscriber: ((state: LibraryState) => void) | null = null;

  const plugin = {
    addStatusBarItem: jest.fn(() => ({
      setText: jest.fn(),
      addClass: jest.fn(),
      removeClass: jest.fn(),
    })),
    addCommand: jest.fn(),
    libraryService: {
      store: {
        subscribe: jest.fn((fn: (state: LibraryState) => void) => {
          subscriber = fn;
          // Simulate immediate fire with current state
          fn(initialState);
          return () => {
            subscriber = null;
          };
        }),
      },
    },
    app: {},
  };

  return {
    plugin,
    emit(state: LibraryState) {
      subscriber?.(state);
    },
  };
}

describe('UIService', () => {
  beforeEach(() => {
    (Notice as unknown as jest.Mock).mockClear();
  });

  describe('showStateNotices deduplication', () => {
    it('shows a notice on Error with parseErrors', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Error,
        parseErrors: ['Unable to load citations'],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      expect(Notice).toHaveBeenCalledWith('Unable to load citations');
    });

    it('shows a notice on Success with parseErrors', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Success,
        parseErrors: ['skipped entry 1'],
        progress: { current: 10, total: 10 },
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('10 entries'),
      );
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('1 entries skipped'),
      );
    });

    it('does not show a notice when status is Idle', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      expect(Notice).not.toHaveBeenCalled();
    });

    it('does not show duplicate notices for the same status', () => {
      const initialState: LibraryState = {
        status: LoadingStatus.Error,
        parseErrors: ['error msg'],
      };
      const { plugin, emit } = makePlugin(initialState);

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      // First notice from subscribe
      expect(Notice).toHaveBeenCalledTimes(1);

      // Emit same status again — should NOT create a second notice
      emit({ status: LoadingStatus.Error, parseErrors: ['error msg'] });
      expect(Notice).toHaveBeenCalledTimes(1);
    });

    it('shows a new notice when status transitions', () => {
      const { plugin, emit } = makePlugin({
        status: LoadingStatus.Loading,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      // Loading does not produce a notice
      expect(Notice).toHaveBeenCalledTimes(0);

      // Transition to Error
      emit({
        status: LoadingStatus.Error,
        parseErrors: ['load failed'],
      });
      expect(Notice).toHaveBeenCalledTimes(1);

      // Transition to Loading again
      emit({ status: LoadingStatus.Loading, parseErrors: [] });
      // Still 1 — Loading has no notice

      // Transition to Success with warnings
      emit({
        status: LoadingStatus.Success,
        parseErrors: ['warn1'],
        progress: { current: 5, total: 5 },
      });
      expect(Notice).toHaveBeenCalledTimes(2);
    });

    it('does not show notice on Success with no parseErrors', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Success,
        parseErrors: [],
        progress: { current: 10, total: 10 },
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      expect(Notice).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('unsubscribes from store on dispose', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const unsubscribeFn =
        plugin.libraryService.store.subscribe.mock.results[0].value;
      expect(typeof unsubscribeFn).toBe('function');

      service.dispose();

      // After dispose, emitting should not cause issues
      // (unsubscribe was called internally)
    });
  });
});
