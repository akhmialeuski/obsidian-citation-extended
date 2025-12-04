import CitationPlugin from './main';
import { CitationsPluginSettings } from './settings';
import { App, FileSystemAdapter, PluginManifest } from 'obsidian';
import * as chokidar from 'chokidar';
import { LibraryService } from './services/library.service';

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
jest.mock('chokidar');
jest.mock('./services/library.service');
jest.mock('./services/template.service');
jest.mock('./services/note.service');
jest.mock('./services/ui.service');
jest.mock('./settings');

describe('CitationPlugin', () => {
  let plugin: CitationPlugin;
  let app: App;
  let watcher: unknown;

  beforeEach(() => {
    app = new App();
    (app as unknown as { vault: { adapter: FileSystemAdapter } }).vault = {
      adapter: new FileSystemAdapter(),
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

    // Mock LibraryService
    (LibraryService as jest.Mock).mockImplementation(() => ({
      load: jest.fn(),
      resolveLibraryPath: jest.fn().mockReturnValue('/path/to/lib'),
      dispose: jest.fn(),
      loadErrorNotifier: { show: jest.fn() },
      getSources: jest.fn().mockImplementation(() => {
        return ['source'];
      }),
      initWatcher: jest.fn(),
      library: { entries: {} },
    }));
  });

  it('should initialize services and library on load', async () => {
    plugin.settings = {
      citationExportPath: 'test.bib',
      databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
    } as CitationsPluginSettings;
    await plugin.onload();

    expect(plugin.libraryService).toBeDefined();
    expect(plugin.libraryService.load).toHaveBeenCalled();
  });

  it('should cleanup resources on unload', async () => {
    plugin.settings = {
      citationExportPath: 'test.bib',
      databases: [{ name: 'Test', path: 'test.bib', type: 'biblatex' }],
    } as CitationsPluginSettings;
    await plugin.onload();

    plugin.onunload();

    expect(plugin.libraryService.dispose).toHaveBeenCalled();
    expect(plugin.literatureNoteErrorNotifier).toBeNull();
  });
});
