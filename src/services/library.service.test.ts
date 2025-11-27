import { LibraryService } from './library.service';
import { CitationsPluginSettings } from '../settings';
import CitationEvents from '../events';
import { FileSystemAdapter } from 'obsidian';
import { Notifier, WorkerManager } from '../util';

jest.mock('obsidian');
jest.mock('../events');
jest.mock('../util');
jest.mock('web-worker:../worker', () => {
    return class MockWorker { };
}, { virtual: true });

describe('LibraryService', () => {
    let service: LibraryService;
    let settings: CitationsPluginSettings;
    let events: CitationEvents;
    let adapter: FileSystemAdapter;

    beforeEach(() => {
        settings = new CitationsPluginSettings();
        events = new CitationEvents();
        adapter = new FileSystemAdapter();

        // Mock WorkerManager
        (WorkerManager as unknown as jest.Mock).mockImplementation(() => ({
            terminate: jest.fn(),
            post: jest.fn(),
        }));

        // Mock Notifier
        (Notifier as unknown as jest.Mock).mockImplementation(() => ({
            destroy: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
        }));

        service = new LibraryService(settings, events, adapter);
    });

    it('should destroy resources', () => {
        service.destroy();
        expect((service as any).loadWorker.terminate).toHaveBeenCalled();
        expect((service as any).loadErrorNotifier.destroy).toHaveBeenCalled();
    });
});
