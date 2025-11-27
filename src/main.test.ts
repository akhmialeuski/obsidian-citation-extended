import CitationPlugin from './main';
import { App, Plugin, FileSystemAdapter } from 'obsidian';
import * as chokidar from 'chokidar';
import { LibraryService } from './services/library.service';

jest.mock('obsidian', () => ({
    App: jest.fn(),
    Plugin: class { },
    FileSystemAdapter: class { },
    debounce: (fn: Function) => fn,
    Notice: jest.fn(),
    TFile: class { },
    MarkdownView: class { },
    PluginSettingTab: class { },
    Setting: class { },
}));
jest.mock('chokidar');
jest.mock('./services/library.service');
jest.mock('./services/template.service');
jest.mock('./services/note.service');
jest.mock('./services/ui.service');
jest.mock('./settings');

describe('CitationPlugin', () => {
    let plugin: CitationPlugin;
    let app: App;
    let watcher: any;

    beforeEach(() => {
        app = new App();
        (app as any).vault = { adapter: new FileSystemAdapter() };
        (app as any).workspace = { activeLeaf: { view: {} } };
        plugin = new CitationPlugin(app, {} as any);

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
            destroy: jest.fn(),
            loadErrorNotifier: { show: jest.fn() },
        }));
    });

    it('should initialize services and library on load', async () => {
        plugin.settings = { citationExportPath: 'test.bib' } as any;
        await plugin.onload();

        expect(plugin.libraryService).toBeDefined();
        expect(plugin.libraryService.load).toHaveBeenCalled();
        expect(chokidar.watch).toHaveBeenCalled();
    });

    it('should cleanup resources on unload', async () => {
        plugin.settings = { citationExportPath: 'test.bib' } as any;
        await plugin.onload();

        plugin.onunload();

        expect(watcher.close).toHaveBeenCalled();
        expect(plugin.libraryService.destroy).toHaveBeenCalled();
        expect(plugin.literatureNoteErrorNotifier).toBeNull();
    });
});
