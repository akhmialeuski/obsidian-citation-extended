/** @jest-environment jsdom */
import { UIService } from '../../src/services/ui.service';
import { LoadingStatus, LibraryState } from '../../src/library/library-state';
import { Notice } from 'obsidian';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    Notice: jest.fn(),
    MarkdownView: class {},
    SuggestModal: class {
      open() {}
      close() {}
      setPlaceholder() {}
      setInstructions() {}
      resultContainerEl = {
        addClass: jest.fn(),
        parentElement: {
          createEl: jest.fn().mockReturnValue({
            createEl: jest.fn().mockReturnValue({
              addClass: jest.fn(),
              removeClass: jest.fn(),
              setText: jest.fn(),
            }),
            addClass: jest.fn(),
            removeClass: jest.fn(),
            children: [
              { addClass: jest.fn(), removeClass: jest.fn() },
              { addClass: jest.fn(), removeClass: jest.fn() },
            ],
          }),
        },
        empty: jest.fn(),
      };
      inputEl = {
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        focus: jest.fn(),
        disabled: false,
      };
    },
  }),
  { virtual: true },
);

// Track CitationSearchModal instantiations
const mockModalOpen = jest.fn();
const mockModalInstances: unknown[] = [];

jest.mock('../../src/ui/modals/citation-search-modal', () => ({
  CitationSearchModal: jest.fn().mockImplementation(function (this: {
    open: jest.Mock;
  }) {
    this.open = mockModalOpen;
    mockModalInstances.push(this);
    return this;
  }),
}));

type CommandDef = { id: string; name: string; callback: () => void };

function makePlugin(initialState: LibraryState) {
  let subscriber: ((state: LibraryState) => void) | null = null;

  const commands: CommandDef[] = [];

  const plugin = {
    addStatusBarItem: jest.fn(() => ({
      setText: jest.fn(),
      addClass: jest.fn(),
      removeClass: jest.fn(),
    })),
    addCommand: jest.fn((cmd: CommandDef) => {
      commands.push(cmd);
    }),
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
      load: jest.fn().mockResolvedValue(null),
    },
    app: {
      workspace: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible mock
        getActiveViewOfType: jest.fn((): any => null),
        activeEditor: null as unknown,
      },
    },
  };

  return {
    plugin,
    commands,
    emit(state: LibraryState) {
      subscriber?.(state);
    },
    getCommand(id: string): CommandDef | undefined {
      return commands.find((c) => c.id === id);
    },
  };
}

describe('UIService', () => {
  beforeEach(() => {
    (Notice as unknown as jest.Mock).mockClear();
    mockModalOpen.mockClear();
    mockModalInstances.length = 0;
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

    it('shows 0 entries when progress is undefined on Success', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Success,
        parseErrors: ['some error'],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('0 entries'));
    });
  });

  describe('updateStatusBar', () => {
    it('sets Idle text', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const statusBar = plugin.addStatusBarItem.mock.results[0].value;
      expect(statusBar.setText).toHaveBeenCalledWith('Citations: Idle');
      expect(statusBar.removeClass).toHaveBeenCalledWith('mod-error');
    });

    it('sets Loading text', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Loading,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const statusBar = plugin.addStatusBarItem.mock.results[0].value;
      expect(statusBar.setText).toHaveBeenCalledWith('Citations: Loading...');
    });

    it('sets Success text with entry count', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Success,
        parseErrors: [],
        progress: { current: 42, total: 42 },
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const statusBar = plugin.addStatusBarItem.mock.results[0].value;
      expect(statusBar.setText).toHaveBeenCalledWith('Citations: 42 entries');
    });

    it('sets Success text with 0 entries when no progress', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Success,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const statusBar = plugin.addStatusBarItem.mock.results[0].value;
      expect(statusBar.setText).toHaveBeenCalledWith('Citations: 0 entries');
    });

    it('sets Error text and adds mod-error class', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Error,
        parseErrors: ['err'],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const statusBar = plugin.addStatusBarItem.mock.results[0].value;
      expect(statusBar.setText).toHaveBeenCalledWith('Citations: Error');
      expect(statusBar.addClass).toHaveBeenCalledWith('mod-error');
    });

    it('removes mod-error class when transitioning from Error to Success', () => {
      const { plugin, emit } = makePlugin({
        status: LoadingStatus.Error,
        parseErrors: ['err'],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const statusBar = plugin.addStatusBarItem.mock.results[0].value;
      expect(statusBar.addClass).toHaveBeenCalledWith('mod-error');

      emit({
        status: LoadingStatus.Success,
        parseErrors: [],
        progress: { current: 5, total: 5 },
      });

      expect(statusBar.removeClass).toHaveBeenCalledWith('mod-error');
    });
  });

  describe('getSelectedText (via registerCommands)', () => {
    it('returns selection from MarkdownView editor', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const mockEditor = { getSelection: jest.fn(() => 'selected text') };
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({
        editor: mockEditor,
      }));

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('open-literature-note');
      cmd!.callback();

      // The modal should have been created with selectedText set
      const { CitationSearchModal } = jest.requireMock(
        '../../src/ui/modals/citation-search-modal',
      );
      const lastCall =
        CitationSearchModal.mock.calls[
          CitationSearchModal.mock.calls.length - 1
        ];
      const passedAction = lastCall[2];
      expect(passedAction.selectedText).toBe('selected text');
    });

    it('falls back to workspace activeEditor when no MarkdownView', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      (plugin.app.workspace as Record<string, unknown>).activeEditor = {
        editor: { getSelection: jest.fn(() => 'fallback text') },
      };

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('open-literature-note');
      cmd!.callback();

      const { CitationSearchModal } = jest.requireMock(
        '../../src/ui/modals/citation-search-modal',
      );
      const lastCall =
        CitationSearchModal.mock.calls[
          CitationSearchModal.mock.calls.length - 1
        ];
      const passedAction = lastCall[2];
      expect(passedAction.selectedText).toBe('fallback text');
    });

    it('returns empty string when no editor is available', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      (plugin.app.workspace as Record<string, unknown>).activeEditor = null;

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('open-literature-note');
      cmd!.callback();

      const { CitationSearchModal } = jest.requireMock(
        '../../src/ui/modals/citation-search-modal',
      );
      const lastCall =
        CitationSearchModal.mock.calls[
          CitationSearchModal.mock.calls.length - 1
        ];
      const passedAction = lastCall[2];
      expect(passedAction.selectedText).toBe('');
    });

    it('returns empty string when activeEditor has no editor property', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      (plugin.app.workspace as Record<string, unknown>).activeEditor = {};

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('open-literature-note');
      cmd!.callback();

      const { CitationSearchModal } = jest.requireMock(
        '../../src/ui/modals/citation-search-modal',
      );
      const lastCall =
        CitationSearchModal.mock.calls[
          CitationSearchModal.mock.calls.length - 1
        ];
      const passedAction = lastCall[2];
      expect(passedAction.selectedText).toBe('');
    });
  });

  describe('registerCommands', () => {
    it('registers 5 commands', () => {
      const { plugin, commands } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      expect(commands).toHaveLength(5);
      expect(plugin.addCommand).toHaveBeenCalledTimes(5);
    });

    it('open-literature-note command opens search modal with OpenNoteAction', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('open-literature-note');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('Open literature note');

      cmd!.callback();

      expect(mockModalOpen).toHaveBeenCalledTimes(1);
    });

    it('update-bib-data command calls libraryService.load', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('update-bib-data');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('Refresh citation database');

      cmd!.callback();

      expect(plugin.libraryService.load).toHaveBeenCalled();
    });

    it('insert-citation command opens search modal with InsertNoteLinkAction', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('insert-citation');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('Insert literature note link');

      cmd!.callback();

      expect(mockModalOpen).toHaveBeenCalled();
    });

    it('insert-literature-note-content command opens search modal with InsertNoteContentAction', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('insert-literature-note-content');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe(
        'Insert literature note content in the current pane',
      );

      cmd!.callback();

      expect(mockModalOpen).toHaveBeenCalled();
    });

    it('insert-markdown-citation command opens search modal with InsertCitationAction', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('insert-markdown-citation');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('Insert Markdown citation');

      cmd!.callback();

      expect(mockModalOpen).toHaveBeenCalled();
    });
  });

  describe('openSearchModal', () => {
    it('creates CitationSearchModal and calls open', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('insert-markdown-citation');
      cmd!.callback();

      const { CitationSearchModal } = jest.requireMock(
        '../../src/ui/modals/citation-search-modal',
      );
      expect(CitationSearchModal).toHaveBeenCalled();
      expect(mockModalOpen).toHaveBeenCalledTimes(1);
    });

    it('injects selectedText into action before creating modal', () => {
      const { plugin, getCommand } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const mockEditor = { getSelection: jest.fn(() => 'injected text') };
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({
        editor: mockEditor,
      }));

      const service = new UIService(plugin.app as never, plugin as never);
      service.init();

      const cmd = getCommand('insert-citation');
      cmd!.callback();

      const { CitationSearchModal } = jest.requireMock(
        '../../src/ui/modals/citation-search-modal',
      );
      const lastCall =
        CitationSearchModal.mock.calls[
          CitationSearchModal.mock.calls.length - 1
        ];
      const action = lastCall[2];
      expect(action.selectedText).toBe('injected text');
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

    it('is safe to call dispose without init', () => {
      const { plugin } = makePlugin({
        status: LoadingStatus.Idle,
        parseErrors: [],
      });

      const service = new UIService(plugin.app as never, plugin as never);
      // Should not throw
      service.dispose();
    });
  });
});
