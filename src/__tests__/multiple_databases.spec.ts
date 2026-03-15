/**
 * @jest-environment jsdom
 */
import { LibraryService } from '../services/library.service';
import { CitationsPluginSettings } from '../settings';
import { Entry } from '../types';
import { WorkerManager } from '../util';
import { LocalFileSource } from '../sources/local-file-source';
import CitationEvents from '../events';
import { MergeStrategy } from '../data-source';

jest.mock('../sources/local-file-source');
jest.mock('../util');
jest.mock(
  'obsidian',
  () => ({
    FileSystemAdapter: jest.fn(),
    PluginSettingTab: jest.fn(),
    Setting: jest.fn(),
    Notice: jest.fn(),
    debounce: jest.fn((fn) => fn),
    Events: class {
      on() {}
      off() {}
      trigger() {}
    },
  }),
  { virtual: true },
);

describe('LibraryService - Multiple Databases', () => {
  let service: LibraryService;
  let settings: CitationsPluginSettings;
  let events: CitationEvents;
  let workerManager: WorkerManager;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    settings = new CitationsPluginSettings();
    events = new CitationEvents();
    workerManager = new WorkerManager({} as Worker);

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
  });

  afterEach(() => {
    service?.dispose();
    jest.restoreAllMocks();
  });

  it('should load entries from multiple databases', async () => {
    settings.databases = [
      { name: 'DB1', path: '/path/to/db1.json', type: 'csl-json' },
      { name: 'DB2', path: '/path/to/db2.json', type: 'csl-json' },
    ];

    const entry1 = { id: 'entry1', title: 'Title 1' } as Entry;
    const entry2 = { id: 'entry2', title: 'Title 2' } as Entry;

    (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
      id,
      load: jest.fn().mockImplementation(async () => {
        if (id === 'source-0')
          return { sourceId: id, entries: [entry1], modifiedAt: new Date() };
        if (id === 'source-1')
          return { sourceId: id, entries: [entry2], modifiedAt: new Date() };
        return { sourceId: id, entries: [], modifiedAt: new Date() };
      }),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    service = new LibraryService(
      settings,
      events,
      null,
      workerManager,
      [],
      MergeStrategy.LastWins,
    );

    await service.load();

    const lib1 = service.library;
    expect(lib1).not.toBeNull();
    expect(lib1?.size).toBe(2);
    expect(lib1?.entries['entry1']).toBeDefined();
    expect(lib1?.entries['entry2']).toBeDefined();
    expect(lib1?.entries['entry1']._sourceDatabase).toBe('DB1');
    expect(lib1?.entries['entry2']._sourceDatabase).toBe('DB2');
  });

  it('should handle duplicate citekeys by creating composite keys', async () => {
    settings.databases = [
      { name: 'DB1', path: '/path/to/db1.json', type: 'csl-json' },
      { name: 'DB2', path: '/path/to/db2.json', type: 'csl-json' },
    ];

    const entry1 = { id: 'duplicate', title: 'Title 1' } as Entry;
    const entry2 = { id: 'duplicate', title: 'Title 2' } as Entry;

    (LocalFileSource as jest.Mock).mockImplementation((id: string) => ({
      id,
      load: jest.fn().mockImplementation(async () => {
        if (id === 'source-0')
          return { sourceId: id, entries: [entry1], modifiedAt: new Date() };
        if (id === 'source-1')
          return { sourceId: id, entries: [entry2], modifiedAt: new Date() };
        return { sourceId: id, entries: [], modifiedAt: new Date() };
      }),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));

    service = new LibraryService(
      settings,
      events,
      null,
      workerManager,
      [],
      MergeStrategy.LastWins,
    );

    await service.load();

    const lib2 = service.library;
    expect(lib2).not.toBeNull();
    expect(lib2?.size).toBe(2);
    expect(lib2?.entries['duplicate@DB1']).toBeDefined();
    expect(lib2?.entries['duplicate@DB2']).toBeDefined();

    expect(lib2?.entries['duplicate@DB1']._compositeCitekey).toBe(
      'duplicate@DB1',
    );
    expect(lib2?.entries['duplicate@DB2']._compositeCitekey).toBe(
      'duplicate@DB2',
    );
  });
});
