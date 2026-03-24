/** @jest-environment jsdom */
import { CommandRegistry } from '../../src/services/command-registry';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
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

interface CommandDef {
  id: string;
  name: string;
  callback: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock factory
function makePlugin(): any {
  const commands: CommandDef[] = [];
  return {
    _commands: commands,
    addCommand: jest.fn((cmd: CommandDef) => {
      commands.push(cmd);
    }),
    app: {
      workspace: {
        getActiveViewOfType: jest.fn(() => null),
        activeEditor: null,
      },
    },
    platform: {
      workspace: {
        getActiveEditor: jest.fn(() => null),
      },
      notifications: { show: jest.fn() },
    },
    libraryService: {
      library: null,
      isLibraryLoading: false,
      load: jest.fn().mockResolvedValue(null),
      searchService: { search: jest.fn(() => []) },
      store: {
        subscribe: jest.fn(() => jest.fn()),
        getState: jest.fn(() => ({ status: 'idle', parseErrors: [] })),
      },
    },
    editorActions: {
      openNoteAtCursor: jest.fn().mockResolvedValue(undefined),
      insertSubsequentCitation: jest.fn().mockResolvedValue(undefined),
    },
    settings: {
      referenceListSortOrder: 'default',
    },
  };
}

describe('CommandRegistry', () => {
  it('registers 8 commands', () => {
    const plugin = makePlugin();
    const registry = new CommandRegistry(plugin);
    registry.registerAll();

    expect(plugin._commands).toHaveLength(8);
    expect(plugin.addCommand).toHaveBeenCalledTimes(8);
  });

  it('open-note-at-cursor command calls editorActions.openNoteAtCursor', () => {
    const plugin = makePlugin();
    const registry = new CommandRegistry(plugin);
    registry.registerAll();

    const cmd = plugin._commands.find(
      (c: CommandDef) => c.id === 'open-note-at-cursor',
    );
    expect(cmd).toBeDefined();
    cmd!.callback();
    expect(plugin.editorActions.openNoteAtCursor).toHaveBeenCalled();
  });

  it('insert-subsequent-citation command opens search modal', () => {
    const plugin = makePlugin();
    const registry = new CommandRegistry(plugin);
    registry.registerAll();

    const cmd = plugin._commands.find(
      (c: CommandDef) => c.id === 'insert-subsequent-citation',
    );
    expect(cmd).toBeDefined();
    // callback should not throw even with null editor
    expect(() => cmd!.callback()).not.toThrow();
  });

  it('insert-multiple-citations command opens search modal', () => {
    const plugin = makePlugin();
    const registry = new CommandRegistry(plugin);
    registry.registerAll();

    const cmd = plugin._commands.find(
      (c: CommandDef) => c.id === 'insert-multiple-citations',
    );
    expect(cmd).toBeDefined();
    expect(() => cmd!.callback()).not.toThrow();
  });

  it('update-bib-data command calls libraryService.load', () => {
    const plugin = makePlugin();
    const registry = new CommandRegistry(plugin);
    registry.registerAll();

    const cmd = plugin._commands.find(
      (c: CommandDef) => c.id === 'update-bib-data',
    );
    cmd!.callback();
    expect(plugin.libraryService.load).toHaveBeenCalled();
  });
});
