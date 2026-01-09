import CitationPlugin from '../main';
import { CitationsPluginSettings } from '../settings';
import { App, PluginManifest, TFile } from 'obsidian';
import { LibraryService } from '../services/library.service';
import { NoteService } from '../services/note.service';
import { TemplateService } from '../services/template.service';

/** @jest-environment jsdom */

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => ({
    App: class {
      vault = {
        adapter: {},
        getConfig: jest.fn(),
      };
      workspace = {
        getActiveViewOfType: jest.fn(),
      };
      metadataCache = {
        fileToLinktext: jest.fn(),
      };
    },
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
      loadData() {
        return Promise.resolve({});
      }
      saveData() {}
    },
    FileSystemAdapter: class {},
    MarkdownView: class {
      editor = {
        replaceSelection: jest.fn(),
      };
    },
    SuggestModal: class {},
    Notice: jest.fn(),
    TFile: class {},
    Events: class {
      on() {}
      off() {}
      trigger() {}
    },
    debounce: (fn: (...args: unknown[]) => unknown) => fn,
    PluginSettingTab: class {},
    Setting: class {},
  }),
  { virtual: true },
);

jest.mock('chokidar');
jest.mock('../services/library.service');
jest.mock('../services/note.service');
jest.mock('../services/template.service');
jest.mock('../settings');
jest.mock('web-worker:./worker', () => class {}, { virtual: true });

describe('Bug Reproduction: Incorrect Markdown Link Extension', () => {
  let plugin: CitationPlugin;
  let app: App;
  let mockFile: TFile;

  beforeEach(() => {
    app = new App();
    plugin = new CitationPlugin(app, {} as PluginManifest);

    // Mock settings
    plugin.settings = {
      citationExportPath: 'test.bib',
      databases: [],
    } as unknown as CitationsPluginSettings;

    // Mock services
    plugin.templateService = new TemplateService(plugin.settings);
    plugin.templateService.getTemplateVariables = jest.fn().mockReturnValue({});
    plugin.templateService.getTitle = jest
      .fn()
      .mockReturnValue('Test Note Title');

    plugin.noteService = new NoteService(
      app,
      plugin.settings,
      plugin.templateService,
    );
    mockFile = new TFile();
    (mockFile as unknown as { path: string }).path = 'Test Note Title.md';
    plugin.noteService.getOrCreateLiteratureNoteFile = jest
      .fn()
      .mockResolvedValue(mockFile);

    plugin.libraryService = {
      library: { entries: { 'test-citekey': { id: 'test-citekey' } } },
    } as unknown as LibraryService;

    // Mock Active Editor
    const mockEditor = {
      replaceSelection: jest.fn(),
    };
    (app.workspace.getActiveViewOfType as jest.Mock).mockReturnValue({
      editor: mockEditor,
    });
  });

  it('should generate WikiLink WITHOUT .md extension when useMarkdownLinks is false', async () => {
    // START: Mock setup for reproduction
    // Simulate "Use Markdown links" = false (WikiLinks)
    (
      app.vault as unknown as { getConfig: jest.Mock }
    ).getConfig.mockReturnValue(false);

    // Mock fileToLinktext behavior
    // When called with omitMdExtension = false (current bug), it returns "File.md"
    // When called with omitMdExtension = true (expected fix), it returns "File"
    (app.metadataCache.fileToLinktext as jest.Mock).mockImplementation(
      (file, path, omitMdExtension) => {
        if (omitMdExtension) {
          return 'Test Note Title';
        }
        return 'Test Note Title.md';
      },
    );
    // END: Mock setup

    await plugin.insertLiteratureNoteLink('test-citekey');

    // Expected behavior after fix:
    // app.metadataCache.fileToLinktext should be called with omitMdExtension = true
    // AND the inserted text should be [[Test Note Title]]

    // CURRENT BUGGY BEHAVIOR ASSERTION (to confirm reproduction):
    // Expect it to FAIL if we asserted correctness right now, OR assert the buggy state to prove it exists.
    // Let's assert the CORRECT behavior, so the test fails, proving the bug exists.

    expect(app.metadataCache.fileToLinktext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      true, // Expect omitMdExtension to be true
    );

    // Get the mock editor from the mocked getActiveViewOfType return value
    const mockView = (app.workspace.getActiveViewOfType as jest.Mock).mock
      .results[0]?.value as { editor: { replaceSelection: jest.Mock } };
    expect(mockView.editor.replaceSelection).toHaveBeenCalledWith(
      '[[Test Note Title]]',
    );
  });
});
