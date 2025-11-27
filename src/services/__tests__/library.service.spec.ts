import { LibraryService } from '../library.service';
import { CitationsPluginSettings } from '../../settings';
import { LoadingStatus } from '../../library-state';
import CitationEvents from '../../events';
import { WorkerManager } from '../../util';
import { DataSource } from '../../data-source';
import { FileSystemAdapter } from 'obsidian';
import * as fs from 'fs';
import { TextDecoder } from 'util';

// Polyfill for Node.js environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.TextDecoder = TextDecoder as any;
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
    Events: class {
      trigger = jest.fn();
      on = jest.fn();
    },
    Notice: class {
      hide = jest.fn();
      show = jest.fn();
    },
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

jest.mock('../../util', () => {
  return {
    Notifier: class {
      show = jest.fn();
      hide = jest.fn();
    },
    WorkerManager: class {
      post = mockWorkerManagerPost;
      constructor() {
        // Mock constructor
      }
    },
  };
});

// Mock worker
jest.mock(
  'web-worker:../worker',
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

describe('LibraryService', () => {
  let service: LibraryService;
  let settings: CitationsPluginSettings;
  let events: { trigger: jest.Mock; on: jest.Mock };
  let vaultAdapter: { getBasePath: jest.Mock };
  let workerManager: { post: jest.Mock };
  let mockSource: {
    id: string;
    load: jest.Mock;
    watch: jest.Mock;
    dispose: jest.Mock;
  };

  beforeEach(() => {
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

    workerManager = {
      post: mockWorkerManagerPost,
    };

    mockSource = {
      id: 'mock-source',
      load: jest.fn().mockResolvedValue([]),
      watch: jest.fn(),
      dispose: jest.fn(),
    };

    service = new LibraryService(
      settings,
      (events as unknown) as CitationEvents,
      (vaultAdapter as unknown) as FileSystemAdapter,
      (workerManager as unknown) as WorkerManager,
      [(mockSource as unknown) as DataSource],
    );

    // Reset mocks
    (fs.promises.stat as jest.Mock).mockReset();
    mockWorkerManagerPost.mockReset();
    mockWorkerManagerPost.mockResolvedValue([]);
  });

  test('initial state is Idle', () => {
    expect(service.state.status).toBe(LoadingStatus.Idle);
  });

  test('load() transitions to Loading then Success', async () => {
    mockSource.load.mockResolvedValue([]);

    const promise = service.load();

    expect(service.state.status).toBe(LoadingStatus.Loading);
    expect(events.trigger).toHaveBeenCalledWith('library-load-start');

    await promise;

    expect(service.state.status).toBe(LoadingStatus.Success);
    expect(events.trigger).toHaveBeenCalledWith('library-load-complete');
    expect(mockSource.load).toHaveBeenCalled();
  });

  test('load() handles source error gracefully', async () => {
    mockSource.load.mockRejectedValue(new Error('Source failed'));

    await service.load();

    // Should still succeed but with empty library
    expect(service.state.status).toBe(LoadingStatus.Success);
    expect(service.library.size).toBe(0);
  });

  test('load() handles worker error via source gracefully', async () => {
    mockSource.load.mockRejectedValue(new Error('Worker failed'));

    await service.load();

    expect(service.state.status).toBe(LoadingStatus.Success);
    expect(service.library.size).toBe(0);
  });
});
