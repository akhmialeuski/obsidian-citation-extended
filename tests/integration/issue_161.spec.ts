import CitationPlugin from '../../src/main';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { App, PluginManifest } from 'obsidian';
import { NoteService } from '../../src/notes/note.service';
import { LibraryService } from '../../src/library/library.service';
import { EditorActions } from '../../src/ui/editor-actions';

// Mock Obsidian types
jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    Plugin: class {
      app: unknown;
      constructor(app: unknown) {
        this.app = app;
      }
      addSettingTab() {}
      addStatusBarItem() {
        return {
          setText: jest.fn(),
          addClass: jest.fn(),
          removeClass: jest.fn(),
        };
      }
      addCommand() {}
    },
    FileSystemAdapter: class {},
    debounce: (fn: (...args: unknown[]) => unknown) => fn,
    Notice: jest.fn(),
    Events: class {
      on() {}
      off() {}
      trigger() {}
    },
    TFile: class {},
    MarkdownView: class {},
    PluginSettingTab: class {},
    Setting: class {},
    SuggestModal: class {},
    Modal: class {},
  }),
  { virtual: true },
);

jest.mock(
  'web-worker:./worker',
  () => {
    return class MockWorker {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
    };
  },
  { virtual: true },
);

describe('Issue 161: Insert Literature Note Link', () => {
  let plugin: CitationPlugin;
  let app: App;
  let mockEditor: {
    replaceSelection: jest.Mock;
    getCursor: jest.Mock;
  };

  beforeEach(() => {
    // Setup Mock App
    app = new App();
    app.vault = {
      getConfig: jest.fn().mockReturnValue(false), // useMarkdownLinks = false by default
    } as unknown as App['vault'];
    app.metadataCache = {
      fileToLinktext: jest.fn(),
    } as unknown as App['metadataCache'];
    app.workspace = {
      getActiveViewOfType: jest.fn(),
    } as unknown as App['workspace'];

    // Setup Mock Editor
    mockEditor = {
      replaceSelection: jest.fn(),
      getCursor: jest.fn(),
    };
    (app.workspace.getActiveViewOfType as jest.Mock).mockReturnValue({
      editor: mockEditor,
    });

    // Initialize Plugin
    plugin = new CitationPlugin(app, {} as PluginManifest);
    plugin.settings = {
      literatureNoteFolder: 'Reading Notes',
    } as CitationsPluginSettings;

    // Mock Services
    plugin.noteService = {
      getOrCreateLiteratureNoteFile: jest.fn(),
    } as unknown as NoteService;

    plugin.libraryService = {
      isLibraryLoading: false,
      library: {
        entries: {
          test_key: {
            id: 'test_key',
            title: 'Test Article',
            author: [{ family: 'Doe', given: 'John' }],
            issued: { 'date-parts': [[2021]] },
          },
        },
      },
    } as unknown as LibraryService;

    plugin.templateService = {
      getTemplateVariables: jest.fn(),
      getTitle: jest.fn().mockReturnValue({ ok: true, value: 'Test Article' }),
    } as unknown as CitationPlugin['templateService'];

    plugin.citationService = {
      getEntry: jest.fn().mockImplementation((citekey: string) => {
        const entry = (
          plugin.libraryService.library as unknown as Record<
            string,
            unknown
          > & { entries: Record<string, unknown> }
        ).entries[citekey];
        if (!entry) return { ok: false, error: { message: 'Not found' } };
        return { ok: true, value: entry };
      }),
      getTitleForCitekey: jest
        .fn()
        .mockReturnValue({ ok: true, value: 'Test Article' }),
      getMarkdownCitation: jest
        .fn()
        .mockReturnValue({ ok: true, value: '[@test_key]' }),
      getInitialContentForCitekey: jest
        .fn()
        .mockResolvedValue({ ok: true, value: '' }),
    } as unknown as typeof plugin.citationService;

    // Setup platform mock for EditorActions
    plugin.platform = {
      workspace: {
        getActiveEditor: jest.fn().mockReturnValue(mockEditor),
        openFile: jest.fn().mockResolvedValue(undefined),
        getConfig: jest.fn().mockReturnValue(false), // useMarkdownLinks = false by default
        fileToLinktext: jest.fn(),
      },
      notifications: {
        show: jest.fn(),
      },
    } as unknown as typeof plugin.platform;

    plugin.editorActions = new EditorActions(
      plugin.citationService,
      plugin.platform,
      plugin.noteService,
      plugin.libraryService,
      plugin.templateService,
      plugin.settings,
    );
  });

  test('should use fileToLinktext for WikiLinks to ensure correct path resolution', async () => {
    // Arrange
    const mockFile = {
      path: 'Reading Notes/Test Article.md',
      name: 'Test Article.md',
    };

    (
      plugin.noteService.getOrCreateLiteratureNoteFile as jest.Mock
    ).mockResolvedValue(mockFile);
    (plugin.platform.workspace.fileToLinktext as jest.Mock).mockReturnValue(
      'Reading Notes/Test Article',
    );

    // Act
    await plugin.editorActions.insertLiteratureNoteLink('test_key');

    // Assert
    expect(
      plugin.noteService.getOrCreateLiteratureNoteFile,
    ).toHaveBeenCalledWith('test_key', expect.anything());
    expect(plugin.platform.workspace.fileToLinktext).toHaveBeenCalledWith(
      mockFile,
      '',
      true,
    );

    expect(mockEditor.replaceSelection).toHaveBeenCalledWith(
      '[[Reading Notes/Test Article]]',
    );
  });

  test('should use fileToLinktext for Markdown links', async () => {
    // Arrange
    (plugin.platform.workspace.getConfig as jest.Mock).mockReturnValue(true); // useMarkdownLinks = true
    const mockFile = {
      path: 'Reading Notes/Test Article.md',
      name: 'Test Article.md',
    };

    (
      plugin.noteService.getOrCreateLiteratureNoteFile as jest.Mock
    ).mockResolvedValue(mockFile);
    (plugin.platform.workspace.fileToLinktext as jest.Mock).mockReturnValue(
      'Reading Notes/Test Article.md',
    );

    // Act
    await plugin.editorActions.insertLiteratureNoteLink('test_key');

    // Assert
    expect(plugin.platform.workspace.fileToLinktext).toHaveBeenCalledWith(
      mockFile,
      '',
      false,
    );
    // Display text defaults to citekey for Markdown links (#271)
    expect(mockEditor.replaceSelection).toHaveBeenCalledWith(
      '[test_key](Reading%20Notes/Test%20Article.md)',
    );
  });
});
