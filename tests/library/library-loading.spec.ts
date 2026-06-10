import { LibraryService } from '../../src/library/library.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { WorkerManager } from '../../src/util';
import { LoadingStatus } from '../../src/library/library-state';
import { createMockPlatformAdapter } from '../helpers/mock-platform';
import { SourceManager } from '../../src/infrastructure/source-manager';
import {
  NormalizationPipeline,
  SourceTaggingStep,
  DeduplicationStep,
} from '../../src/infrastructure/normalization-pipeline';
import type { DatabaseType } from '../../src/core/types/database';

import { LocalFileSource } from '../../src/sources/local-file-source';

// Mock dependencies
jest.mock('../../src/sources/local-file-source');
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

jest.mock('../../src/util', () => ({
  WorkerManager: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
  })),
}));

global.window = {
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
} as unknown as Window & typeof globalThis;

describe('LibraryService Loading Behavior', () => {
  let service: LibraryService;
  let settings: CitationsPluginSettings;
  let workerManager: WorkerManager;

  beforeEach(() => {
    settings = new CitationsPluginSettings();
    const platform = createMockPlatformAdapter();
    workerManager = new WorkerManager({} as Worker);

    // Wire up SourceManager + pipeline (mirrors production setup)
    const factory = {
      create: (_def: { path: string; format: DatabaseType }, id: string) =>
        new LocalFileSource(id, _def.path, _def.format, workerManager, null),
    };

    service = new LibraryService(
      settings,
      platform,
      workerManager,
      new SourceManager(factory as never),
      new NormalizationPipeline()
        .addStep(new SourceTaggingStep())
        .addStep(new DeduplicationStep()),
    );

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
    settings.databases = [
      { name: 'Test', path: 'test.json', type: 'csl-json' },
    ];

    (LocalFileSource as jest.Mock).mockImplementation(() => ({
      id: 'test-source',
      load: jest.fn().mockRejectedValue(new Error('File not found')),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    const stateChangeSpy = jest.fn();
    service.store.subscribe(stateChangeSpy);

    await service.load();

    // Now we expect Error status because all sources failed
    expect(service.state.status).toBe(LoadingStatus.Error);
    expect(service.state.error).toBeDefined();
    expect(service.state.error?.message).toContain('File not found');
  });

  it('should timeout if loading takes too long, without a retry storm', async () => {
    jest.useFakeTimers();
    global.window.setTimeout = setTimeout;
    global.window.clearTimeout = clearTimeout;

    settings.databases = [
      { name: 'Slow', path: 'slow.json', type: 'csl-json' },
    ];

    // Never resolves — forces the load timeout to fire. Capture the signal so
    // we can assert it is aborted when the timeout fires.
    let capturedSignal: AbortSignal | undefined;
    const loadMock = jest.fn().mockImplementation((signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    (LocalFileSource as jest.Mock).mockImplementation(() => ({
      id: 'slow-source',
      load: loadMock,
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    const loadPromise = service.load();

    // Fast-forward past the default 30s load timeout
    jest.advanceTimersByTime(31000);

    await loadPromise;

    expect(service.state.status).toBe(LoadingStatus.Error);
    expect(service.state.error?.message).toContain('Timeout');
    // The timeout must abort the threaded signal so sources stop in-flight work.
    expect(capturedSignal?.aborted).toBe(true);

    // A timeout must NOT schedule a retry: the worker is still parsing, so a
    // retry would queue a second parse behind it (a self-worsening storm).
    // Advancing past the first backoff window must not trigger another load.
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(loadMock).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
