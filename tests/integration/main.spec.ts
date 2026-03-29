import CitationPlugin from '../../src/main';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { App, FileSystemAdapter, PluginManifest } from 'obsidian';
import * as chokidar from 'chokidar';
import { LibraryService } from '../../src/library/library.service';
import { validateSettings } from '../../src/ui/settings/settings-schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock returns in tests
const mockedValidateSettings = validateSettings as any as jest.Mock;

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
    normalizePath: (p: string) => p,
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
jest.mock('chokidar');
jest.mock('../../src/library/library.service');
jest.mock('../../src/template/template.service');
jest.mock('../../src/notes/note.service');
jest.mock('../../src/services/ui.service');
jest.mock('../../src/ui/settings/settings');
jest.mock('../../src/ui/settings/settings-schema', () => ({
  DEFAULT_SETTINGS: {},
  DEFAULT_CONTENT_TEMPLATE: '---\ntitle: {{title}}\n---',
  validateSettings: jest.fn().mockReturnValue({
    success: true,
    data: { databases: [], literatureNoteContentTemplatePath: '' },
  }),
  SettingsSchema: { shape: {} },
  CITATION_STYLE_PRESETS: {},
}));
jest.mock('../../src/ui/settings/settings-tab');

describe('CitationPlugin', () => {
  let plugin: CitationPlugin;
  let app: App;
  let watcher: unknown;

  beforeEach(() => {
    app = new App();
    (
      app as unknown as {
        vault: {
          adapter: FileSystemAdapter;
          getAbstractFileByPath: jest.Mock;
          create: jest.Mock;
          read: jest.Mock;
        };
      }
    ).vault = {
      adapter: new FileSystemAdapter(),
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(''),
    };
    (
      app as unknown as { workspace: { activeLeaf: { view: unknown } } }
    ).workspace = {
      activeLeaf: { view: {} },
    };
    plugin = new CitationPlugin(app, {} as unknown as PluginManifest);
    plugin.app = app;

    // Mock loadSettings
    plugin.loadSettings = jest.fn().mockResolvedValue(undefined);
    plugin.saveData = jest.fn();
    plugin.loadData = jest.fn().mockResolvedValue({});

    // Mock watcher
    watcher = {
      on: jest.fn().mockReturnThis(),
      close: jest.fn(),
    };
    (chokidar.watch as jest.Mock).mockReturnValue(watcher);

    (LibraryService as jest.Mock).mockImplementation(() => ({
      load: jest.fn(),
      resolveLibraryPath: jest.fn().mockReturnValue('/path/to/lib'),
      dispose: jest.fn(),
      initWatcher: jest.fn(),
      library: { entries: {} },
      store: {
        subscribe: jest.fn().mockReturnValue(jest.fn()),
        getState: jest.fn().mockReturnValue({ status: 'idle' }),
        dispose: jest.fn(),
      },
    }));
  });

  it('should initialize services and library on load', async () => {
    plugin.settings = {
      citationExportPath: 'test.bib',
      databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
      templateProfiles: [],
    } as unknown as CitationsPluginSettings;
    await plugin.onload();

    expect(plugin.libraryService).toBeDefined();
    expect(plugin.libraryService.load).toHaveBeenCalled();
  });

  it('should cleanup resources on unload', async () => {
    plugin.settings = {
      citationExportPath: 'test.bib',
      databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
      templateProfiles: [],
    } as unknown as CitationsPluginSettings;
    await plugin.onload();

    const uiDisposeSpy = jest.spyOn(plugin.uiService, 'dispose');
    const libDisposeSpy = jest.spyOn(plugin.libraryService, 'dispose');

    plugin.onunload();

    expect(uiDisposeSpy).toHaveBeenCalled();
    expect(libDisposeSpy).toHaveBeenCalled();
  });

  it('warns when no databases are configured in init()', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    plugin.settings = {
      databases: [],
      templateProfiles: [],
    } as unknown as CitationsPluginSettings;
    await plugin.onload();

    expect(warnSpy).toHaveBeenCalledWith(
      'Citations plugin: No data sources configured',
    );
    warnSpy.mockRestore();
  });

  describe('loadSettings', () => {
    beforeEach(() => {
      plugin.loadSettings = CitationPlugin.prototype.loadSettings.bind(plugin);
      plugin.saveData = jest.fn().mockResolvedValue(undefined);

      const vaultMock = {
        adapter: new FileSystemAdapter(),
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn().mockResolvedValue({}),
        read: jest.fn().mockResolvedValue('content'),
      };
      (app as unknown as Record<string, unknown>).vault = vaultMock;
    });

    it('creates default settings when no data is loaded', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);
      await plugin.loadSettings();
      expect(plugin.settings).toBeDefined();
    });

    it('validates and merges loaded settings', async () => {
      mockedValidateSettings.mockReturnValue({
        success: true,
        data: {
          databases: [],
          literatureNoteContentTemplate: '',
          literatureNoteContentTemplatePath: 'tmpl.md',
        },
      });
      plugin.loadData = jest.fn().mockResolvedValue({ x: 1 });
      await plugin.loadSettings();
      expect(mockedValidateSettings).toHaveBeenCalled();
    });

    it('migrates legacy citationExportPath to databases', async () => {
      mockedValidateSettings.mockReturnValue({
        success: true,
        data: {
          databases: [],
          citationExportPath: '/old.bib',
          citationExportFormat: 'biblatex',
          literatureNoteContentTemplate: '',
          literatureNoteContentTemplatePath: 'tmpl.md',
        },
      });
      plugin.loadData = jest.fn().mockResolvedValue({});
      await plugin.loadSettings();
      expect(plugin.settings.databases.length).toBe(1);
    });

    it('handles validation failure', async () => {
      mockedValidateSettings.mockReturnValue({ success: false, error: {} });
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      plugin.loadData = jest.fn().mockResolvedValue({});
      await plugin.loadSettings();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('getEntry', () => {
    it('returns error when library is loading', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = true;

      const result = plugin.citationService.getEntry('key1');
      expect(result.ok).toBe(false);
    });

    it('returns error when library is null', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (plugin.libraryService as unknown as Record<string, unknown>).library =
        null;

      const result = plugin.citationService.getEntry('key1');
      expect(result.ok).toBe(false);
    });

    it('returns error when entry not found', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;

      const result = plugin.citationService.getEntry('nonexistent');
      expect(result.ok).toBe(false);
    });

    it('returns entry when found', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      const mockEntry = { id: 'key1', toJSON: () => ({}) };
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: { key1: mockEntry },
      };

      const result = plugin.citationService.getEntry('key1');
      expect(result.ok).toBe(true);
    });
  });

  describe('resolveContentTemplate', () => {
    async function setupPlugin() {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
    }

    it('reads template from vault file', async () => {
      await setupPlugin();
      plugin.settings.literatureNoteContentTemplatePath = 'template.md';
      const { TFile } = jest.requireMock('obsidian');
      const mockFile = {};
      Object.setPrototypeOf(mockFile, TFile.prototype);
      plugin.app.vault = {
        getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
        read: jest.fn().mockResolvedValue('# Content'),
      } as unknown as typeof plugin.app.vault;

      const result = await plugin.contentTemplateResolver.resolve();
      expect(result).toBe('# Content');
    });

    it('returns default when file not found', async () => {
      await setupPlugin();
      plugin.settings.literatureNoteContentTemplatePath = 'missing.md';
      plugin.app.vault = {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
      } as unknown as typeof plugin.app.vault;

      const result = await plugin.contentTemplateResolver.resolve();
      expect(result).toBe('---\ntitle: {{title}}\n---');
    });

    it('returns default when no path configured', async () => {
      await setupPlugin();
      plugin.settings.literatureNoteContentTemplatePath = '';
      const result = await plugin.contentTemplateResolver.resolve();
      expect(result).toBe('---\ntitle: {{title}}\n---');
    });
  });

  describe('getMarkdownCitationForCitekey', () => {
    async function setupWithEntry() {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      // Configure auto-mocked templateService (same instance held by citationService)
      (
        plugin.templateService.getTemplateVariables as jest.Mock
      ).mockReturnValue({});
      (plugin.templateService.getMarkdownCitation as jest.Mock).mockReturnValue(
        { ok: true, value: '[@key1]' },
      );
      (plugin.templateService.getTitle as jest.Mock).mockReturnValue({
        ok: true,
        value: 'Title',
      });
      (plugin.templateService.render as jest.Mock).mockReturnValue({
        ok: true,
        value: 'content',
      });
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: { key1: { id: 'key1', toJSON: () => ({}) } },
      };
    }

    it('returns citation when library is ready', async () => {
      await setupWithEntry();
      const result = plugin.citationService.getMarkdownCitation('key1', false);
      expect(result.ok).toBe(true);
    });

    it('returns error when library not ready', async () => {
      await setupWithEntry();
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = true;
      const result = plugin.citationService.getMarkdownCitation('key1', false);
      expect(result.ok).toBe(false);
    });
  });

  describe('getAlternativeMarkdownCitationForCitekey', () => {
    it('returns alternative citation', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.templateService.getTemplateVariables as jest.Mock
      ).mockReturnValue({});
      (plugin.templateService.getMarkdownCitation as jest.Mock).mockReturnValue(
        { ok: true, value: '@key1' },
      );
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: { key1: { id: 'key1', toJSON: () => ({}) } },
      };

      const result = plugin.citationService.getMarkdownCitation('key1', true);
      expect(result.ok).toBe(true);
    });
  });

  describe('getTitleForCitekey', () => {
    it('returns error when entry not found', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: {},
      };

      const result = plugin.citationService.getTitleForCitekey('nonexistent');
      expect(result.ok).toBe(false);
    });

    it('returns sanitized title', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.templateService.getTemplateVariables as jest.Mock
      ).mockReturnValue({});
      (plugin.templateService.getTitle as jest.Mock).mockReturnValue({
        ok: true,
        value: 'Title: Test',
      });
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: { key1: { id: 'key1', toJSON: () => ({}) } },
      };

      const result = plugin.citationService.getTitleForCitekey('key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Colon should be replaced with _
        expect(result.value).toBe('Title_ Test');
      }
    });
  });

  describe('getInitialContentForCitekey', () => {
    it('returns content when entry exists', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        literatureNoteContentTemplatePath: '',
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.templateService.getTemplateVariables as jest.Mock
      ).mockReturnValue({});
      (plugin.templateService.render as jest.Mock).mockReturnValue({
        ok: true,
        value: 'rendered',
      });
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: { key1: { id: 'key1', toJSON: () => ({}) } },
      };

      const result = await plugin.citationService.getInitialContentForCitekey(
        'key1',
        'selected',
      );
      expect(result).toBeDefined();
      if (result) expect(result.ok).toBe(true);
    });

    it('returns error when entry not found', async () => {
      plugin.settings = {
        databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
        templateProfiles: [],
      } as unknown as CitationsPluginSettings;
      await plugin.onload();
      (
        plugin.libraryService as unknown as Record<string, unknown>
      ).isLibraryLoading = false;
      (plugin.libraryService as unknown as Record<string, unknown>).library = {
        entries: {},
      };

      const result =
        await plugin.citationService.getInitialContentForCitekey('nonexistent');
      expect(result.ok).toBe(false);
    });
  });
});
