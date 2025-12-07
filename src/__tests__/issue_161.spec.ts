import CitationPlugin from '../main';
import { CitationsPluginSettings } from '../settings';
import { App, PluginManifest, TFile } from 'obsidian';
import { NoteService } from '../services/note.service';
import { LibraryService } from '../services/library.service';

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

    // Mock Template Service methods used in main.ts
    plugin.templateService = {
      getTemplateVariables: jest.fn(),
      getTitle: jest.fn().mockReturnValue('Test Article'),
    } as unknown as CitationPlugin['templateService'];
  });

  test('should use fileToLinktext for WikiLinks to ensure correct path resolution', async () => {
    // Arrange
    const mockFile = new TFile();
    mockFile.path = 'Reading Notes/Test Article.md';

    (
      plugin.noteService.getOrCreateLiteratureNoteFile as jest.Mock
    ).mockResolvedValue(mockFile);
    (app.metadataCache.fileToLinktext as jest.Mock).mockReturnValue(
      'Reading Notes/Test Article',
    );

    // Act
    await plugin.insertLiteratureNoteLink('test_key');

    // Assert
    expect(
      plugin.noteService.getOrCreateLiteratureNoteFile,
    ).toHaveBeenCalledWith('test_key', expect.anything());
    expect(app.metadataCache.fileToLinktext).toHaveBeenCalledWith(
      mockFile,
      '',
      false,
    );

    // This expectation reflects the DESIRED behavior (fixing the bug)
    // The current code likely does `[[Test Article]]` which might fail if the desired behavior is `[[Reading Notes/Test Article]]`
    expect(mockEditor.replaceSelection).toHaveBeenCalledWith(
      '[[Reading Notes/Test Article]]',
    );
  });

  test('should use fileToLinktext for Markdown links', async () => {
    // Arrange
    (
      app.vault as unknown as { getConfig: jest.Mock }
    ).getConfig.mockReturnValue(true); // useMarkdownLinks = true
    const mockFile = new TFile();
    mockFile.path = 'Reading Notes/Test Article.md';

    (
      plugin.noteService.getOrCreateLiteratureNoteFile as jest.Mock
    ).mockResolvedValue(mockFile);
    (app.metadataCache.fileToLinktext as jest.Mock).mockReturnValue(
      'Reading Notes/Test Article.md',
    );

    // Act
    await plugin.insertLiteratureNoteLink('test_key');

    // Assert
    expect(app.metadataCache.fileToLinktext).toHaveBeenCalledWith(
      mockFile,
      '',
      false,
    );
    // Note: main.ts currently does encodeURI(fileToLinktext(...))
    // We expect standard markdown link format
    expect(mockEditor.replaceSelection).toHaveBeenCalledWith(
      '[Test Article](Reading%20Notes/Test%20Article.md)',
    );
  });
});
