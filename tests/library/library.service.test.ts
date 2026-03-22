import { LibraryService } from '../../src/library/library.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { WorkerManager } from '../../src/util';
import { createMockPlatformAdapter } from '../helpers/mock-platform';

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

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    settings = new CitationsPluginSettings();
    const platform = createMockPlatformAdapter();
    const workerManager = new WorkerManager({} as Worker);

    service = new LibraryService(settings, platform, workerManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should dispose resources', () => {
    service.dispose();
  });
});
