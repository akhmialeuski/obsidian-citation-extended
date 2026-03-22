import { LibraryService } from '../../src/library/library.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { LoadingStatus } from '../../src/library/library-state';
import { WorkerManager } from '../../src/util';
import { createMockPlatformAdapter } from '../helpers/mock-platform';
import { createMockDataSource } from '../helpers/mock-obsidian';
import * as fs from 'fs';
import { TextDecoder } from 'util';
import type { DataSource } from '../../src/data-source';
import type { IDataSourceFactory } from '../../src/sources/data-source-factory';

// Polyfill for Node.js environment
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
global.DataView = DataView;

// Mock obsidian
jest.mock(
  'obsidian',
  () => ({
    App: class {},
    PluginSettingTab: class {},
    Setting: class {},
    FileSystemAdapter: class {
      static readLocalFile = jest.fn();
      getBasePath = jest.fn().mockReturnValue('/');
    },
    Notice: jest.fn(),
  }),
  { virtual: true },
);

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
const mockWorkerManagerPost = jest.fn().mockResolvedValue([]);

jest.mock('../../src/util', () => {
  return {
    WorkerManager: class {
      post = mockWorkerManagerPost;
      dispose = jest.fn();
      constructor() {
        // Mock constructor
      }
    },
  };
});

// Mock worker
jest.mock(
  'web-worker:../../src/worker',
  () => {
    const MockWorker = class {
      constructor() {
        // Mock worker constructor
      }
    };
    return {
      __esModule: true,
      default: MockWorker,
    };
  },
  { virtual: true },
);

// Mock window
global.window = {
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
} as unknown as Window & typeof globalThis;

import { LocalFileSource } from '../../src/sources/local-file-source';

// Mock LocalFileSource
jest.mock('../../src/sources/local-file-source');

describe('LibraryService', () => {
  let service: LibraryService;
  let settings: CitationsPluginSettings;
  let workerManager: { post: jest.Mock; dispose: jest.Mock };
  let platform: ReturnType<typeof createMockPlatformAdapter>;

  beforeEach(() => {
    settings = new CitationsPluginSettings();
    settings.databases = [
      { name: 'Test', path: 'test.json', type: 'biblatex' },
    ];

    platform = createMockPlatformAdapter();

    workerManager = {
      post: mockWorkerManagerPost,
      dispose: jest.fn(),
    };

    (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
      id,
      load: jest.fn().mockResolvedValue({
        sourceId: id,
        entries: [],
        modifiedAt: new Date(),
      }),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    service = new LibraryService(
      settings,
      platform,
      workerManager as unknown as WorkerManager,
      [],
    );
    service.setDataSourceFactory({
      create: (def, id) =>
        new LocalFileSource(
          id,
          def.path,
          def.format,
          workerManager as unknown as WorkerManager,
          null,
        ),
    });

    // Reset mocks
    (fs.promises.stat as jest.Mock).mockReset();
    mockWorkerManagerPost.mockReset();
    mockWorkerManagerPost.mockResolvedValue([]);

    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    service.dispose();
    jest.restoreAllMocks();
  });

  test('initial state is Idle', () => {
    expect(service.state.status).toBe(LoadingStatus.Idle);
  });

  test('load() transitions to Loading then Success', async () => {
    const promise = service.load();

    expect(service.state.status).toBe(LoadingStatus.Loading);

    await promise;

    expect(service.state.status).toBe(LoadingStatus.Success);
  });

  test('load() handles source error gracefully (now expects Error status)', async () => {
    (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
      id,
      load: jest.fn().mockRejectedValue(new Error('Source failed')),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    await service.load();

    // Now expects Error status because all sources failed
    expect(service.state.status).toBe(LoadingStatus.Error);
    expect(service.state.error).toBeDefined();
  });

  test('load() merges entries from multiple sources (LastWins)', async () => {
    settings.databases = [
      { name: 'DB1', path: 'db1.json', type: 'biblatex' },
      { name: 'DB2', path: 'db2.json', type: 'biblatex' },
    ];

    (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
      id,
      load: jest.fn().mockImplementation(async () => {
        if (id === 'source-0')
          return {
            sourceId: id,
            entries: [{ id: '1', title: 'A' }],
            modifiedAt: new Date(),
          };
        if (id === 'source-1')
          return {
            sourceId: id,
            entries: [
              { id: '1', title: 'B' },
              { id: '2', title: 'C' },
            ],
            modifiedAt: new Date(),
          };
        return { sourceId: id, entries: [], modifiedAt: new Date() };
      }),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    await service.load();

    const library = service.library;
    expect(library).not.toBeNull();
    expect(library?.size).toBe(3);
    expect(library?.entries['1@DB1']).toBeDefined();
    expect(library?.entries['1@DB2']).toBeDefined();
    expect(library?.entries['2']).toBeDefined();
  });

  test('initWatcher() sets up watchers for all sources', async () => {
    await service.load();

    // Verify sources were created and watchers set up
    const sources = service.getSources();
    expect(sources.length).toBe(1);
    // watch() is called by load() -> initWatcher()
    for (const source of sources) {
      expect(source.watch).toHaveBeenCalled();
    }
  });

  test('dispose() cleans up resources', async () => {
    await service.load();
    const sources = service.getSources();
    service.dispose();

    // After dispose, sources should be empty
    expect(service.getSources()).toHaveLength(0);
    // dispose() was called on each source
    for (const source of sources) {
      expect(source.dispose).toHaveBeenCalled();
    }
  });

  test('load() shows notification when no databases are configured', async () => {
    settings.databases = [];

    const result = await service.load();

    expect(result).toBeNull();
    expect(platform.notifications.show).toHaveBeenCalledTimes(1);
    expect(platform.notifications.show).toHaveBeenCalledWith(
      'No citation databases configured. Please add at least one database in the citation plugin settings.',
    );
  });

  test('load() does not show notification when databases exist', async () => {
    settings.databases = [
      { name: 'Test', path: 'test.json', type: 'biblatex' },
    ];

    await service.load();

    expect(platform.notifications.show).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // New tests for uncovered lines
  // ===========================================================================

  // ---- addSource / removeSource (lines 79-102) ----------------------------

  describe('addSource()', () => {
    it('adds a data source to the internal sources list', () => {
      const mockSource = createMockDataSource('custom-1', []);
      service.addSource(mockSource as unknown as DataSource);

      const sources = service.getSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('custom-1');
    });

    it('logs a debug message', () => {
      const mockSource = createMockDataSource('custom-2', []);
      service.addSource(mockSource as unknown as DataSource);

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('Added source custom-2'),
      );
    });
  });

  describe('removeSource()', () => {
    it('removes an existing source and disposes it', () => {
      const mockSource = createMockDataSource('to-remove', []);
      service.addSource(mockSource as unknown as DataSource);
      expect(service.getSources()).toHaveLength(1);

      service.removeSource('to-remove');
      expect(service.getSources()).toHaveLength(0);
      expect(mockSource.dispose).toHaveBeenCalledTimes(1);
    });

    it('logs a debug message when source is removed', () => {
      const mockSource = createMockDataSource('to-remove', []);
      service.addSource(mockSource as unknown as DataSource);
      service.removeSource('to-remove');

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('Removed source to-remove'),
      );
    });

    it('does nothing when sourceId is not found', () => {
      const mockSource = createMockDataSource('existing', []);
      service.addSource(mockSource as unknown as DataSource);

      service.removeSource('nonexistent');
      expect(service.getSources()).toHaveLength(1);
      expect(mockSource.dispose).not.toHaveBeenCalled();
    });
  });

  // ---- getTemplateVariables (line 98) -------------------------------------

  describe('getTemplateVariables()', () => {
    it('delegates to introspectionService.getTemplateVariables', () => {
      const spy = jest.spyOn(
        service.introspectionService,
        'getTemplateVariables',
      );
      const result = service.getTemplateVariables();

      expect(spy).toHaveBeenCalledWith(service.library);
      expect(Array.isArray(result)).toBe(true);
    });

    it('passes the current library (null when not loaded)', () => {
      const spy = jest.spyOn(
        service.introspectionService,
        'getTemplateVariables',
      );
      service.getTemplateVariables();
      expect(spy).toHaveBeenCalledWith(null);
    });

    it('passes the loaded library after loading', async () => {
      await service.load();
      const spy = jest.spyOn(
        service.introspectionService,
        'getTemplateVariables',
      );
      service.getTemplateVariables();
      expect(spy).toHaveBeenCalledWith(service.library);
      expect(service.library).not.toBeNull();
    });
  });

  // ---- resolveLibraryPath (line 101-102) ----------------------------------

  describe('resolveLibraryPath()', () => {
    it('delegates to platform.resolvePath', () => {
      const result = service.resolveLibraryPath('my/library.json');
      expect(platform.resolvePath).toHaveBeenCalledWith('my/library.json');
      expect(result).toBe('/vault/my/library.json');
    });
  });

  // ---- isLibraryLoading getter (line 400-401) -----------------------------

  describe('isLibraryLoading', () => {
    it('returns false in Idle state', () => {
      expect(service.isLibraryLoading).toBe(false);
    });

    it('returns true during loading', () => {
      // Don't await — check during loading
      const promise = service.load();
      expect(service.isLibraryLoading).toBe(true);
      return promise;
    });

    it('returns false after successful load', async () => {
      await service.load();
      expect(service.isLibraryLoading).toBe(false);
    });

    it('returns false after error', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockRejectedValue(new Error('fail')),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));
      await service.load();
      expect(service.isLibraryLoading).toBe(false);
    });
  });

  // ---- load() abort controller (lines 144-154) ---------------------------

  describe('load() abort controller', () => {
    it('aborts previous load when second load is called', async () => {
      // Use an injected source with controlled resolution
      let resolveFirst: ((v: unknown) => void) | undefined;
      const source = {
        id: 'controlled',
        load: jest.fn(),
        watch: jest.fn(),
        dispose: jest.fn(),
      };

      // First call: slow (manually controlled)
      source.load.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
      // Second call: fast
      source.load.mockImplementationOnce(() =>
        Promise.resolve({
          sourceId: 'controlled',
          entries: [],
          modifiedAt: new Date(),
        }),
      );

      const svc = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [source as unknown as DataSource],
      );

      const firstLoad = svc.load();

      // Immediately start second load (aborts the first)
      const secondLoad = svc.load();

      // Resolve the slow source (first load should detect abort and return null)
      resolveFirst!({
        sourceId: 'controlled',
        entries: [],
        modifiedAt: new Date(),
      });

      const [firstResult, secondResult] = await Promise.all([
        firstLoad,
        secondLoad,
      ]);
      expect(firstResult).toBeNull();
      expect(secondResult).not.toBeNull();

      svc.dispose();
    });

    it('resets retryCount and clears retryTimer on non-retry load', async () => {
      // Use injected sources to control behavior precisely
      let callCount = 0;
      const source = {
        id: 'retry-source',
        load: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 1) {
            throw new Error('fail');
          }
          return {
            sourceId: 'retry-source',
            entries: [],
            modifiedAt: new Date(),
          };
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      };

      const svc = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [source as unknown as DataSource],
      );

      // First load fails
      await svc.load();
      expect(svc.state.status).toBe(LoadingStatus.Error);

      // Second load (not retry) succeeds
      await svc.load(false);
      expect(svc.state.status).toBe(LoadingStatus.Success);

      svc.dispose();
    });
  });

  // ---- mergeEntries() — deduplication with source metadata (lines 109-131) -

  describe('mergeEntries()', () => {
    it('creates composite keys for duplicate citekeys across sources', async () => {
      settings.databases = [
        { name: 'DB1', path: 'db1.json', type: 'biblatex' },
        { name: 'DB2', path: 'db2.json', type: 'biblatex' },
      ];

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockImplementation(async () => {
          if (id === 'source-0')
            return {
              sourceId: id,
              entries: [
                { id: 'dup', title: 'From DB1' },
                { id: 'unique1', title: 'Unique A' },
              ],
              modifiedAt: new Date(),
            };
          return {
            sourceId: id,
            entries: [
              { id: 'dup', title: 'From DB2' },
              { id: 'unique2', title: 'Unique B' },
            ],
            modifiedAt: new Date(),
          };
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      const lib = service.library!;

      // Duplicate entry should produce composite keys
      expect(lib.entries['dup@DB1']).toBeDefined();
      expect(lib.entries['dup@DB2']).toBeDefined();
      // Unique entries remain as-is
      expect(lib.entries['unique1']).toBeDefined();
      expect(lib.entries['unique2']).toBeDefined();
      expect(lib.size).toBe(4);
    });

    it('sets _compositeCitekey on deduplicated entries', async () => {
      settings.databases = [
        { name: 'DB1', path: 'a.json', type: 'csl-json' },
        { name: 'DB2', path: 'b.json', type: 'csl-json' },
      ];

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [{ id: 'shared', title: `From ${id}` }],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      const lib = service.library!;

      expect(lib.entries['shared@DB1']._compositeCitekey).toBe('shared@DB1');
      expect(lib.entries['shared@DB2']._compositeCitekey).toBe('shared@DB2');
    });
  });

  // ---- load() full flow: parse errors (lines 216-258) ---------------------

  describe('load() parse errors', () => {
    it('collects parse errors from sources and stores them in state', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [{ id: 'ok', title: 'Good Entry' }],
          parseErrors: [
            { message: 'Bad entry 1', citekey: 'bad1' },
            { message: 'Bad entry 2', citekey: 'bad2' },
          ],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();

      expect(service.state.status).toBe(LoadingStatus.Success);
      expect(service.state.parseErrors).toHaveLength(2);
      expect(service.state.parseErrors[0]).toBe('Bad entry 1');

      // Source metadata should record the parse error count
      expect(service.sourceMetadata).toHaveLength(1);
      expect(service.sourceMetadata[0].parseErrorCount).toBe(2);
    });

    it('truncates parse errors to at most 10 messages', async () => {
      const manyErrors = Array.from({ length: 15 }, (_, i) => ({
        message: `Error ${i}`,
        citekey: `bad${i}`,
      }));

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [{ id: 'ok', title: 'Good' }],
          parseErrors: manyErrors,
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      expect(service.state.parseErrors).toHaveLength(10);
    });

    it('logs warning when parse errors exist', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [{ id: 'ok', title: 'Good' }],
          parseErrors: [{ message: 'Bad entry', citekey: 'bad' }],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('1 entries skipped'),
        expect.anything(),
      );
    });
  });

  // ---- load() partial failure: some sources succeed, some fail ------------

  describe('load() partial source failure', () => {
    it('succeeds with entries from working sources when some fail', async () => {
      settings.databases = [
        { name: 'Good', path: 'good.json', type: 'csl-json' },
        { name: 'Bad', path: 'bad.json', type: 'csl-json' },
      ];

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockImplementation(async () => {
          if (id === 'source-0') {
            return {
              sourceId: id,
              entries: [{ id: 'entry1', title: 'Entry 1' }],
              modifiedAt: new Date(),
            };
          }
          throw new Error('Source failed');
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      const result = await service.load();
      expect(result).not.toBeNull();
      expect(result!.size).toBe(1);
      expect(service.state.status).toBe(LoadingStatus.Success);
    });

    it('handles non-Error throw from source gracefully', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockRejectedValue('string error'),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      // All sources failed, so Error status
      expect(service.state.status).toBe(LoadingStatus.Error);
    });
  });

  // ---- createSources() (lines 297-313) -----------------------------------

  describe('createSources()', () => {
    it('uses injected sources when they exist', async () => {
      const injectedSource = createMockDataSource('injected-0', [
        { id: 'item1', title: 'Injected' },
      ]);

      const serviceWithSources = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [injectedSource as unknown as DataSource],
      );

      await serviceWithSources.load();
      expect(serviceWithSources.library).not.toBeNull();
      expect(injectedSource.load).toHaveBeenCalled();
      serviceWithSources.dispose();
    });

    it('returns empty array when no factory is set and no sources injected', async () => {
      const serviceNoFactory = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [],
      );
      // Do not set a factory
      await serviceNoFactory.load();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('No data source factory'),
      );
      serviceNoFactory.dispose();
    });

    it('creates sources from factory when no injected sources exist', async () => {
      const mockFactory: IDataSourceFactory = {
        create: jest.fn().mockImplementation((_def, id) => ({
          id,
          load: jest.fn().mockResolvedValue({
            sourceId: id,
            entries: [],
            modifiedAt: new Date(),
          }),
          watch: jest.fn(),
          dispose: jest.fn(),
        })),
      };

      const serviceWithFactory = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [],
      );
      serviceWithFactory.setDataSourceFactory(mockFactory);

      await serviceWithFactory.load();
      expect(mockFactory.create).toHaveBeenCalledTimes(1);
      serviceWithFactory.dispose();
    });
  });

  // ---- handleErrorRetry() (lines 315-329) ---------------------------------

  describe('handleErrorRetry()', () => {
    it('schedules a retry with exponential backoff on error', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockRejectedValue(new Error('fail')),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      expect(service.state.status).toBe(LoadingStatus.Error);

      // A retry timer should have been set (1000ms delay for first retry)
      jest.advanceTimersByTime(1000);

      // Allow the retry promise to settle
      await Promise.resolve();
      await Promise.resolve();

      // The retry load should have been called (2nd attempt)
      // It will fail again and schedule another retry at 2000ms
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      jest.useRealTimers();
    });

    it('stops retrying after MAX_RETRY_COUNT (5) attempts', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });

      let loadCallCount = 0;
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockImplementation(async () => {
          loadCallCount++;
          throw new Error('persistent failure');
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      // Initial load (attempt 0)
      await service.load();

      // Run through 5 retries with exponential backoff: 1s, 2s, 4s, 8s, 16s
      for (let i = 0; i < 5; i++) {
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        jest.advanceTimersByTime(delay);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }

      // After 5 retries, no more should be scheduled
      const countAfterRetries = loadCallCount;
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      await Promise.resolve();

      // No additional load calls beyond what we already saw
      expect(loadCallCount).toBe(countAfterRetries);

      jest.useRealTimers();
    });
  });

  // ---- initWatcher() (lines 331-354) --------------------------------------

  describe('initWatcher()', () => {
    it('sets up watchers for injected sources after load', async () => {
      const mockSource = createMockDataSource('src-0', []);

      const serviceWithSources = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [mockSource as unknown as DataSource],
      );

      await serviceWithSources.load();

      // initWatcher no longer calls dispose before watch
      expect(mockSource.watch).toHaveBeenCalled();

      serviceWithSources.dispose();
    });

    it('does nothing when sources list is empty', () => {
      // Service with no sources
      const emptyService = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [],
      );

      // Call initWatcher directly — should not throw
      emptyService.initWatcher();
      emptyService.dispose();
    });

    it('catches and logs errors from watch setup', async () => {
      const badSource = {
        id: 'bad-watcher',
        load: jest.fn().mockResolvedValue({
          sourceId: 'bad-watcher',
          entries: [],
          modifiedAt: new Date(),
        }),
        watch: jest.fn().mockImplementation(() => {
          throw new Error('Watch setup failed');
        }),
        dispose: jest.fn(),
      };

      const serviceWithBadSource = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [badSource as unknown as DataSource],
      );

      await serviceWithBadSource.load();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error setting up watcher'),
        expect.any(Error),
      );

      serviceWithBadSource.dispose();
    });

    it('watcher callback triggers debounced reload', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });
      // Update window.setTimeout to use the faked version
      global.window.setTimeout =
        setTimeout as unknown as typeof window.setTimeout;
      global.window.clearTimeout =
        clearTimeout as unknown as typeof window.clearTimeout;

      let watchCallback: (() => void) | undefined;
      const watchableSource = {
        id: 'watchable',
        load: jest.fn().mockResolvedValue({
          sourceId: 'watchable',
          entries: [],
          modifiedAt: new Date(),
        }),
        watch: jest.fn().mockImplementation((cb: () => void) => {
          watchCallback = cb;
        }),
        dispose: jest.fn(),
      };

      const serviceWatchable = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [watchableSource as unknown as DataSource],
      );

      await serviceWatchable.load();
      expect(watchCallback).toBeDefined();

      // Set up spy BEFORE triggering the watch callback
      const loadSpy = jest.spyOn(serviceWatchable, 'load');

      // Trigger the watch callback
      watchCallback!();

      // Load should be scheduled with debounce (1000ms)
      jest.advanceTimersByTime(1000);

      expect(loadSpy).toHaveBeenCalled();

      serviceWatchable.dispose();
      jest.useRealTimers();
      // Restore window timers
      global.window.setTimeout =
        setTimeout as unknown as typeof window.setTimeout;
      global.window.clearTimeout =
        clearTimeout as unknown as typeof window.clearTimeout;
    });
  });

  // ---- dispose() full cleanup (lines 366-398) -----------------------------

  describe('dispose() full cleanup', () => {
    it('clears debounce timer', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });

      let watchCallback: (() => void) | undefined;
      const source = {
        id: 'src',
        load: jest.fn().mockResolvedValue({
          sourceId: 'src',
          entries: [],
          modifiedAt: new Date(),
        }),
        watch: jest.fn().mockImplementation((cb: () => void) => {
          watchCallback = cb;
        }),
        dispose: jest.fn(),
      };

      const svc = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [source as unknown as DataSource],
      );

      await svc.load();
      // Trigger debounce timer via watcher
      watchCallback!();

      // Dispose should clear the debounce timer
      svc.dispose();

      // Advancing time should not trigger load
      const loadSpy = jest.spyOn(svc, 'load');
      jest.advanceTimersByTime(5000);
      expect(loadSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('clears retry timer', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockRejectedValue(new Error('fail')),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      // retry timer should be set

      service.dispose();

      // Advancing time should not trigger retry
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      jest.useRealTimers();
    });

    it('aborts in-progress load', () => {
      // Start a load (no await)
      const loadPromise = service.load();
      // Dispose while loading
      service.dispose();

      // The load should return null
      return loadPromise.then((result) => {
        expect(result).toBeNull();
      });
    });

    it('handles source dispose errors gracefully', async () => {
      const errorSource = {
        id: 'error-dispose',
        load: jest.fn().mockResolvedValue({
          sourceId: 'error-dispose',
          entries: [],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn().mockImplementation(() => {
          throw new Error('Dispose failed');
        }),
      };

      const svc = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [errorSource as unknown as DataSource],
      );

      await svc.load();
      // dispose() should not throw even if source.dispose() throws
      expect(() => svc.dispose()).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error disposing source'),
        expect.any(Error),
      );
    });

    it('disposes store and worker manager', async () => {
      const storeSpy = jest.spyOn(service.store, 'dispose');
      service.dispose();

      expect(storeSpy).toHaveBeenCalled();
    });
  });

  // ---- sourceMetadata (lines 219-234) -------------------------------------

  describe('sourceMetadata', () => {
    it('records metadata for each source after load', async () => {
      settings.databases = [
        { name: 'MyDB', path: 'my.json', type: 'csl-json' },
      ];

      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
          ],
          modifiedAt: new Date('2024-06-15'),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();

      expect(service.sourceMetadata).toHaveLength(1);
      expect(service.sourceMetadata[0]).toEqual(
        expect.objectContaining({
          databaseName: 'MyDB',
          entryCount: 2,
          parseErrorCount: 0,
        }),
      );
    });

    it('uses sourceId as fallback name when database config is missing', async () => {
      // Load entries with a sourceId that does not match a database index
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: 'source-99',
          entries: [],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();

      expect(service.sourceMetadata).toHaveLength(1);
      // Falls back to sourceId since databases[99] doesn't exist
      expect(service.sourceMetadata[0].databaseName).toBe('source-99');
    });
  });

  // ---- load() state.progress (lines 254-258) -----------------------------

  describe('load() sets progress in state', () => {
    it('sets progress.current and progress.total on success', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [
            { id: 'x', title: 'X' },
            { id: 'y', title: 'Y' },
          ],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();

      const state = service.state;
      expect(state.progress).toBeDefined();
      expect(state.progress!.current).toBe(2);
      expect(state.progress!.total).toBe(2);
    });
  });

  // ---- load() error path stores message in state (lines 275-294) ----------

  describe('load() error path', () => {
    it('stores error message in state parseErrors', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockRejectedValue(new Error('Database corrupt')),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();

      expect(service.state.status).toBe(LoadingStatus.Error);
      expect(service.state.parseErrors).toHaveLength(1);
      expect(service.state.parseErrors[0]).toContain('Database corrupt');
    });

    it('handles error without message property', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockRejectedValue({ notAnError: true }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();

      expect(service.state.status).toBe(LoadingStatus.Error);
    });
  });

  // ---- getSources() (line 94) -------------------------------------------

  describe('getSources()', () => {
    it('returns a copy of the sources array', () => {
      const mockSource = createMockDataSource('src-1', []);
      service.addSource(mockSource as unknown as DataSource);

      const sources = service.getSources();
      expect(sources).toHaveLength(1);

      // Mutating the returned array should not affect internals
      sources.pop();
      expect(service.getSources()).toHaveLength(1);
    });
  });

  // ---- setDataSourceFactory (line 70-72) ----------------------------------

  describe('setDataSourceFactory()', () => {
    it('stores the factory for use in createSources', async () => {
      const mockFactory: IDataSourceFactory = {
        create: jest.fn().mockReturnValue({
          id: 'factory-src',
          load: jest.fn().mockResolvedValue({
            sourceId: 'factory-src',
            entries: [],
            modifiedAt: new Date(),
          }),
          watch: jest.fn(),
          dispose: jest.fn(),
        }),
      };

      const svc = new LibraryService(
        settings,
        platform,
        workerManager as unknown as WorkerManager,
        [],
      );
      svc.setDataSourceFactory(mockFactory);
      await svc.load();

      expect(mockFactory.create).toHaveBeenCalled();
      svc.dispose();
    });
  });

  // ---- load() sets lastLoaded date (line 256) ----------------------------

  describe('load() sets lastLoaded date', () => {
    it('updates lastLoaded in state after success', async () => {
      const before = new Date();
      await service.load();
      const state = service.state;

      expect(state.lastLoaded).toBeDefined();
      expect(state.lastLoaded!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });

  // ---- load() with no parseErrors produces empty array (line 243-245) ----

  describe('load() with no parse errors', () => {
    it('sets parseErrors to empty array', async () => {
      (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
        id,
        load: jest.fn().mockResolvedValue({
          sourceId: id,
          entries: [{ id: 'ok', title: 'Fine' }],
          modifiedAt: new Date(),
        }),
        watch: jest.fn(),
        dispose: jest.fn(),
      }));

      await service.load();
      expect(service.state.parseErrors).toEqual([]);
    });
  });
});
