import CitationPlugin from '../../src/main';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { App, PluginManifest } from 'obsidian';
import { LibraryService } from '../../src/library/library.service';
import { NoteService } from '../../src/notes/note.service';
import { TemplateService } from '../../src/template/template.service';
import { EditorActions } from '../../src/ui/editor-actions';

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
    Modal: class {},
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
jest.mock('../../src/library/library.service');
jest.mock('../../src/notes/note.service');
jest.mock('../../src/template/template.service');
jest.mock('../../src/ui/settings/settings');
jest.mock('../../src/ui/settings/settings-schema');
jest.mock('../../src/ui/settings/settings-tab');
jest.mock('web-worker:./worker', () => class {}, { virtual: true });

describe('Bug Reproduction: Incorrect Markdown Link Extension', () => {
  let plugin: CitationPlugin;
  let app: App;

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
      .mockReturnValue({ ok: true, value: 'Test Note Title' });

    // Setup platform mock
    const mockEditor = {
      replaceSelection: jest.fn(),
    };
    plugin.platform = {
      workspace: {
        getActiveEditor: jest.fn().mockReturnValue(mockEditor),
        openFile: jest.fn().mockResolvedValue(undefined),
        getConfig: jest.fn(),
        fileToLinktext: jest.fn(),
      },
      notifications: {
        show: jest.fn(),
      },
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        getMarkdownFiles: jest.fn().mockReturnValue([]),
        create: jest.fn(),
        read: jest.fn(),
        createFolder: jest.fn().mockResolvedValue(undefined),
        isFile: jest.fn().mockReturnValue(true),
        isFolder: jest.fn().mockReturnValue(false),
      },
      normalizePath: jest.fn((p: string) => p),
      resolvePath: jest.fn((p: string) => p),
      fileSystem: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        exists: jest.fn(),
        createFolder: jest.fn(),
        getBasePath: jest.fn().mockReturnValue('/vault'),
      },
      addStatusBarItem: jest.fn(() => ({
        setText: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn(),
      })),
    } as unknown as typeof plugin.platform;

    plugin.noteService = new NoteService(
      plugin.platform,
      plugin.settings,
      plugin.templateService,
    );
    const mockFile = { path: 'Test Note Title.md', name: 'Test Note Title.md' };
    plugin.noteService.getOrCreateLiteratureNoteFile = jest
      .fn()
      .mockResolvedValue(mockFile);

    plugin.libraryService = {
      isLibraryLoading: false,
      library: { entries: { 'test-citekey': { id: 'test-citekey' } } },
    } as unknown as LibraryService;

    plugin.citationService = {
      getEntry: jest.fn().mockImplementation((citekey: string) => {
        const entry = (plugin.libraryService.library as unknown as Record<string, unknown> & { entries: Record<string, unknown> }).entries[citekey];
        if (!entry) return { ok: false, error: { message: 'Not found' } };
        return { ok: true, value: entry };
      }),
      getTitleForCitekey: jest.fn().mockReturnValue({ ok: true, value: 'Test Note Title' }),
      getMarkdownCitation: jest.fn().mockReturnValue({ ok: true, value: '[@test-citekey]' }),
      getInitialContentForCitekey: jest.fn().mockResolvedValue({ ok: true, value: '' }),
    } as unknown as typeof plugin.citationService;

    plugin.editorActions = new EditorActions(
      plugin.citationService,
      plugin.platform,
      plugin.noteService,
      plugin.libraryService,
      plugin.templateService,
      plugin.settings,
    );
  });

  it('should generate WikiLink WITHOUT .md extension when useMarkdownLinks is false', async () => {
    // Simulate "Use Markdown links" = false (WikiLinks)
    (plugin.platform.workspace.getConfig as jest.Mock).mockReturnValue(false);

    // Mock fileToLinktext behavior
    (plugin.platform.workspace.fileToLinktext as jest.Mock).mockImplementation(
      (_file: unknown, _path: unknown, omitMdExtension: boolean) => {
        if (omitMdExtension) {
          return 'Test Note Title';
        }
        return 'Test Note Title.md';
      },
    );

    await plugin.editorActions.insertLiteratureNoteLink('test-citekey');

    expect(plugin.platform.workspace.fileToLinktext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      true, // Expect omitMdExtension to be true
    );

    // Get the mock editor from the platform workspace
    const mockEditor = (plugin.platform.workspace.getActiveEditor as jest.Mock)
      .mock.results[0]?.value as { replaceSelection: jest.Mock };
    expect(mockEditor.replaceSelection).toHaveBeenCalledWith(
      '[[Test Note Title]]',
    );
  });
});
