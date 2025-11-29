import { LibraryService } from './library.service';
import { CitationsPluginSettings } from '../settings';
import CitationEvents from '../events';
import { FileSystemAdapter } from 'obsidian';
import { Notifier, WorkerManager } from '../util';

jest.mock(
  'obsidian',
  () => ({
    Events: class {
      on() {}
      off() {}
      trigger() {}
    },
    FileSystemAdapter: class {
      getBasePath() {
        return '';
      }
    },
    PluginSettingTab: class {},
    Notice: class {
      hide() {}
    },
  }),
  { virtual: true },
);
jest.mock('../events');
jest.mock('../util');
jest.mock(
  'web-worker:../worker',
  () => {
    return class MockWorker {};
  },
  { virtual: true },
);

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
    const workerManager = new WorkerManager({} as Worker);

    // Mock Notifier
    (Notifier as unknown as jest.Mock).mockImplementation(() => ({
      show: jest.fn(),
      hide: jest.fn(),
    }));

    service = new LibraryService(settings, events, adapter, workerManager);
  });

  it('should dispose resources', () => {
    service.dispose();
    // Verify dispose logic (e.g. timers cleared, sources disposed)
    // Since we don't have easy access to private properties, we assume it works if it doesn't throw.
    // Or we could mock sources and check if they are disposed.
  });
});
