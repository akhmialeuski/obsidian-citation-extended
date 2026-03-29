/** @jest-environment jsdom */
import { CommandRegistry } from '../../src/services/command-registry';
import {
  SearchModalAction,
  ApplicationAction,
} from '../../src/application/actions/action.types';
import type {
  ActionDescriptor,
  ActionContext,
} from '../../src/application/actions/action.types';
import type { IActionRegistry } from '../../src/application/actions/action-registry';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    Plugin: class {},
    SuggestModal: class {
      resultContainerEl = {
        addClass: jest.fn(),
        empty: jest.fn(),
        parentElement: {
          createEl: jest.fn(() => ({
            createEl: jest.fn(() => ({})),
          })),
        },
      };
      inputEl = {
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
        value: '',
        disabled: false,
        focus: jest.fn(),
      };
      open() {}
      close() {}
      setPlaceholder() {}
      setInstructions() {}
    },
    Notice: jest.fn(),
    MarkdownView: class {},
  }),
  { virtual: true },
);

jest.mock('../../src/ui/modals/citation-search-modal', () => ({
  CitationSearchModal: jest.fn().mockImplementation(() => ({
    open: jest.fn(),
  })),
}));

interface CommandDef {
  id: string;
  name: string;
  callback?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock type
  editorCallback?: (editor: any) => void;
}

/** Create a concrete ApplicationAction subclass for testing. */
class TestApplicationAction extends ApplicationAction {
  descriptor: ActionDescriptor;
  execute = jest.fn().mockResolvedValue(undefined);

  constructor(
    id: string,
    name: string,
    ctx: ActionContext,
    requiresEditor = false,
  ) {
    super(ctx);
    this.descriptor = {
      id,
      name,
      showInCommandPalette: true,
      showInContextMenu: false,
      requiresEditor,
    };
  }
}

/** Create a concrete SearchModalAction subclass for testing. */
class TestSearchModalAction extends SearchModalAction {
  descriptor: ActionDescriptor;
  execute = jest.fn().mockResolvedValue(undefined);
  onChoose = jest.fn();

  constructor(
    id: string,
    name: string,
    ctx: ActionContext,
    requiresEditor = false,
  ) {
    super(ctx);
    this.descriptor = {
      id,
      name,
      showInCommandPalette: true,
      showInContextMenu: false,
      requiresEditor,
    };
  }
}

function makeActionCtx(): ActionContext {
  return {
    platform: {
      workspace: {
        getActiveEditor: jest.fn(() => null),
      },
      notifications: { show: jest.fn() },
    },
    settings: {
      referenceListSortOrder: 'default',
    },
    citationService: {},
    noteService: {},
    libraryService: {},
    templateService: {},
  } as unknown as ActionContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock factory
function makeLibraryService(): any {
  return {
    library: null,
    isLibraryLoading: false,
    load: jest.fn().mockResolvedValue(null),
    searchService: { search: jest.fn(() => []) },
    store: {
      subscribe: jest.fn(() => jest.fn()),
      getState: jest.fn(() => ({ status: 'idle', parseErrors: [] })),
    },
  };
}

function buildTestActions(ctx: ActionContext) {
  return [
    new TestApplicationAction(
      'open-note-at-cursor',
      'Open note at cursor',
      ctx,
      true, // requiresEditor
    ),
    new TestSearchModalAction('insert-citation', 'Insert citation', ctx, true),
    new TestSearchModalAction(
      'insert-subsequent-citation',
      'Insert subsequent citation',
      ctx,
      true,
    ),
    new TestSearchModalAction(
      'insert-multiple-citations',
      'Insert multiple citations',
      ctx,
      true,
    ),
    new TestSearchModalAction(
      'insert-literature-note',
      'Insert literature note',
      ctx,
      true,
    ),
    new TestApplicationAction('update-bib-data', 'Update bib data', ctx, false),
    new TestSearchModalAction(
      'open-literature-note',
      'Open literature note',
      ctx,
    ),
    new TestSearchModalAction('copy-citekey', 'Copy citekey', ctx),
  ];
}

describe('CommandRegistry', () => {
  let commands: CommandDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only
  let mockPlugin: any;
  let actionCtx: ActionContext;
  let libraryService: ReturnType<typeof makeLibraryService>;
  let actionRegistry: IActionRegistry;
  let actions: (TestApplicationAction | TestSearchModalAction)[];

  beforeEach(() => {
    commands = [];
    mockPlugin = {
      addCommand: jest.fn((cmd: CommandDef) => {
        commands.push(cmd);
      }),
    };
    actionCtx = makeActionCtx();
    libraryService = makeLibraryService();
    actions = buildTestActions(actionCtx);
    actionRegistry = {
      register: jest.fn(),
      getAll: jest.fn(() => actions),
      getById: jest.fn((id: string) =>
        actions.find((a) => a.descriptor.id === id),
      ),
      getContextMenuActions: jest.fn(() => []),
      getCommandPaletteActions: jest.fn(() => actions),
    };
  });

  it('registers 8 commands', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    expect(commands).toHaveLength(8);
    expect(mockPlugin.addCommand).toHaveBeenCalledTimes(8);
  });

  it('non-modal action with requiresEditor: true uses editorCallback', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'open-note-at-cursor');
    expect(cmd).toBeDefined();
    expect(cmd!.editorCallback).toBeDefined();
    expect(cmd!.callback).toBeUndefined();
  });

  it('non-modal action with requiresEditor: false uses callback', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'update-bib-data');
    expect(cmd).toBeDefined();
    expect(cmd!.callback).toBeDefined();
    expect(cmd!.editorCallback).toBeUndefined();
  });

  it('SearchModalAction always uses callback regardless of requiresEditor', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    // insert-citation has requiresEditor: true but is a SearchModalAction
    const cmd = commands.find((c) => c.id === 'insert-citation');
    expect(cmd).toBeDefined();
    expect(cmd!.callback).toBeDefined();
    expect(cmd!.editorCallback).toBeUndefined();
  });

  it('non-modal action editorCallback calls action.execute()', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'open-note-at-cursor');
    expect(cmd).toBeDefined();

    const mockEditor = { getSelection: jest.fn(() => 'cursor selection') };
    cmd!.editorCallback!(mockEditor);

    const action = actions.find(
      (a) => a.descriptor.id === 'open-note-at-cursor',
    ) as TestApplicationAction;
    expect(action.execute).toHaveBeenCalledWith({
      selectedText: 'cursor selection',
    });
  });

  it('non-modal callback action calls action.execute()', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'update-bib-data');
    expect(cmd).toBeDefined();
    cmd!.callback!();

    const action = actions.find(
      (a) => a.descriptor.id === 'update-bib-data',
    ) as TestApplicationAction;
    expect(action.execute).toHaveBeenCalledWith({ selectedText: '' });
  });

  it('SearchModalAction callback opens a search modal', () => {
    const { CitationSearchModal } = jest.requireMock(
      '../../src/ui/modals/citation-search-modal',
    );

    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'insert-subsequent-citation');
    expect(cmd).toBeDefined();
    expect(() => cmd!.callback!()).not.toThrow();
    expect(CitationSearchModal).toHaveBeenCalled();
  });

  it('insert-multiple-citations command opens search modal without throwing', () => {
    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'insert-multiple-citations');
    expect(cmd).toBeDefined();
    expect(() => cmd!.callback!()).not.toThrow();
  });

  it('passes selected text to modal action', () => {
    const mockEditor = { getSelection: jest.fn(() => 'some selected text') };
    (actionCtx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(
      mockEditor,
    );

    const registry = new CommandRegistry(
      {} as never,
      mockPlugin,
      actionRegistry,
      actionCtx,
      libraryService,
    );
    registry.registerAll();

    const cmd = commands.find((c) => c.id === 'insert-citation');
    cmd!.callback!();

    const action = actions.find(
      (a) => a.descriptor.id === 'insert-citation',
    ) as TestSearchModalAction;
    expect(action.selectedText).toBe('some selected text');
  });
});
