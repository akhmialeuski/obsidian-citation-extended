import { LibraryService } from '../library.service';
import { CitationsPluginSettings } from '../../settings';
import { LoadingStatus } from '../../library-state';
import { App } from 'obsidian';
import * as fs from 'fs';

// Mock obsidian
jest.mock('obsidian', () => ({
    App: class { },
    PluginSettingTab: class { },
    FileSystemAdapter: class {
        static readLocalFile = jest.fn();
        getBasePath = jest.fn().mockReturnValue('/');
    },
    Events: class {
        trigger = jest.fn();
        on = jest.fn();
    },
    Notice: class {
        hide = jest.fn();
        show = jest.fn();
    },
}), { virtual: true });

// Mock fs
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        promises: {
            ...originalFs.promises,
            stat: jest.fn(),
        },
    };
});

// Mock util
jest.mock('../../util', () => {
    return {
        Notifier: class {
            show = jest.fn();
            hide = jest.fn();
        },
        WorkerManager: class {
            post = jest.fn();
        },
    };
});

// Mock worker
jest.mock('web-worker:../worker', () => class { }, { virtual: true });

describe('LibraryService', () => {
    let service: LibraryService;
    let settings: CitationsPluginSettings;
    let events: any;
    let vaultAdapter: any;

    beforeEach(() => {
        try {
            settings = new CitationsPluginSettings();
            settings.citationExportPath = 'library.bib';
            settings.citationExportFormat = 'biblatex';

            events = {
                trigger: jest.fn(),
                on: jest.fn(),
            };

            vaultAdapter = {
                getBasePath: jest.fn().mockReturnValue('/vault'),
            };

            console.log('Creating LibraryService...');
            service = new LibraryService(settings, events, vaultAdapter);
            console.log('LibraryService created:', !!service);

            // @ts-ignore
            if (service.loadWorker && service.loadWorker.post) {
                // @ts-ignore
                service.loadWorker.post.mockReset();
            } else {
                console.error('loadWorker or post is undefined');
            }

            (fs.promises.stat as jest.Mock).mockReset();
        } catch (e) {
            console.error('beforeEach failed:', e);
        }
    });

    test('initial state is Idle', () => {
        expect(service.state.status).toBe(LoadingStatus.Idle);
    });

    test('load() transitions to Loading then Success', async () => {
        (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 100 });
        // @ts-ignore
        const readLocalFileSpy = require('obsidian').FileSystemAdapter.readLocalFile;
        readLocalFileSpy.mockResolvedValue(new ArrayBuffer(10));

        // @ts-ignore
        service.loadWorker.post.mockResolvedValue([]);

        const promise = service.load();

        expect(service.state.status).toBe(LoadingStatus.Loading);
        expect(events.trigger).toHaveBeenCalledWith('library-load-start');

        await promise;

        expect(service.state.status).toBe(LoadingStatus.Success);
        expect(events.trigger).toHaveBeenCalledWith('library-load-complete');
    });

    test('load() handles empty file error', async () => {
        (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 0 });

        await service.load();

        expect(service.state.status).toBe(LoadingStatus.Error);
        expect(service.state.error).toBeDefined();
    });

    test('load() handles worker error', async () => {
        (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 100 });
        // @ts-ignore
        require('obsidian').FileSystemAdapter.readLocalFile.mockResolvedValue(new ArrayBuffer(10));
        // @ts-ignore
        service.loadWorker.post.mockRejectedValue(new Error('Worker failed'));

        await service.load();

        expect(service.state.status).toBe(LoadingStatus.Error);
    });
});
