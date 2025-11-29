import { LibraryService } from '../services/library.service';
import { CitationsPluginSettings } from '../settings';
import CitationEvents from '../events';
import { FileSystemAdapter } from 'obsidian';
import { WorkerManager } from '../util';
import { DataSource } from '../data-source';
import { LoadingStatus } from '../library-state';

// Mock dependencies
jest.mock(
  'obsidian',
  () => ({
    FileSystemAdapter: class {
      getBasePath() {
        return '/mock/vault';
      }
    },
    Notice: class {
      hide() {}
      show() {}
    },
    PluginSettingTab: class {},
    Events: class {
      on() {}
      off() {}
      trigger() {}
    },
  }),
  { virtual: true },
);

jest.mock('../util', () => ({
  Notifier: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
    hide: jest.fn(),
  })),
  WorkerManager: jest.fn(),
}));

global.window = {
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('LibraryService Loading Behavior', () => {
  let service: LibraryService;
  let settings: CitationsPluginSettings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let events: any;
  let adapter: FileSystemAdapter;
  let workerManager: WorkerManager;

  beforeEach(() => {
    settings = new CitationsPluginSettings();
    events = new CitationEvents();
    adapter = new FileSystemAdapter();
    workerManager = new WorkerManager({} as Worker);

    service = new LibraryService(settings, events, adapter, workerManager);

    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    service.dispose();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should set status to Error when source throws error (new behavior)', async () => {
    const mockSource: DataSource = {
      id: 'test-source',
      load: jest.fn().mockRejectedValue(new Error('File not found')),
      watch: jest.fn(),
      dispose: jest.fn(),
    };

    service.addSource(mockSource);

    const stateChangeSpy = jest.fn();
    events.on('library-state-changed', stateChangeSpy);

    await service.load();

    // Now we expect Error status because all sources failed
    expect(service.state.status).toBe(LoadingStatus.Error);
    expect(service.state.error).toBeDefined();
    expect(service.state.error?.message).toContain('File not found');
  });

  it('should timeout if loading takes too long', async () => {
    jest.useFakeTimers();
    global.window.setTimeout = setTimeout;
    global.window.clearTimeout = clearTimeout;
    const mockSource: DataSource = {
      id: 'slow-source',
      load: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
      watch: jest.fn(),
      dispose: jest.fn(),
    };
    service.addSource(mockSource);

    const loadPromise = service.load();

    // Fast-forward time
    jest.advanceTimersByTime(11000);

    await loadPromise;

    expect(service.state.status).toBe(LoadingStatus.Error);
    expect(service.state.error?.message).toContain('Timeout');

    jest.useRealTimers();
  });
});
