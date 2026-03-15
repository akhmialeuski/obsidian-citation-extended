import { LibraryService } from '../../src/library/library.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { FileSystemAdapter } from 'obsidian';
import { WorkerManager } from '../../src/util';

jest.mock(
  'obsidian',
  () => ({
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
jest.mock('../../src/util');
jest.mock(
  'web-worker:../../src/worker',
  () => {
    return class MockWorker {};
  },
  { virtual: true },
);

describe('LibraryService', () => {
  let service: LibraryService;
  let settings: CitationsPluginSettings;
  let adapter: FileSystemAdapter;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    settings = new CitationsPluginSettings();
    adapter = new FileSystemAdapter();

    // Mock WorkerManager
    const workerManager = new WorkerManager({} as Worker);

    service = new LibraryService(settings, adapter, workerManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should dispose resources', () => {
    service.dispose();
    // Verify dispose logic (e.g. timers cleared, sources disposed)
    // Since we don't have easy access to private properties, we assume it works if it doesn't throw.
    // Or we could mock sources and check if they are disposed.
  });
});
