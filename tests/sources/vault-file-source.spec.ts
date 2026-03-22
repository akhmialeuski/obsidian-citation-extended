/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  'obsidian',
  () => {
    class MockTFile {
      path: string;
      name: string;
      stat: { mtime: number };

      constructor(filePath = '', fileName = '', mtime = Date.now()) {
        this.path = filePath;
        this.name = fileName;
        this.stat = { mtime };
      }
    }

    return {
      Vault: class {},
      EventRef: class {},
      TFile: MockTFile,
    };
  },
  { virtual: true },
);

import { TFile } from 'obsidian';
import { VaultFileSource } from '../../src/sources/vault-file-source';
import {
  DATABASE_FORMATS,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
} from '../../src/core';
import type { WorkerResponse } from '../../src/core';
import { WorkerManager } from '../../src/util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorkerManager(
  postResult?: WorkerResponse | any[],
): WorkerManager {
  const wm = {
    post: jest.fn(),
    dispose: jest.fn(),
  } as unknown as WorkerManager;

  if (postResult !== undefined) {
    (wm.post as jest.Mock).mockResolvedValue(postResult);
  }

  return wm;
}

interface MockVault {
  getAbstractFileByPath: jest.Mock;
  read: jest.Mock;
  on: jest.Mock;
  offref: jest.Mock;
}

function createMockVault(): MockVault {
  return {
    getAbstractFileByPath: jest.fn(),
    read: jest.fn(),
    on: jest.fn().mockReturnValue({ id: 'event-ref' }),
    offref: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Timer setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultFileSource', () => {
  const defaultId = 'src-vault-1';
  const defaultPath = 'references/library.bib';
  const defaultFormat = DATABASE_FORMATS.BibLaTeX;
  const fixedMtime = new Date('2024-06-01T00:00:00Z').getTime();

  let workerManager: WorkerManager;
  let vault: MockVault;

  const sampleBibLaTeXEntry = {
    key: 'doe2024',
    type: 'article',
    fields: { title: ['Test Title'], author: ['John Doe'] },
    creators: { author: [{ firstName: 'John', lastName: 'Doe' }] },
    crossref: { donated: [], inherited: [] },
  };

  const sampleCSLEntry = {
    id: 'smith2024',
    type: 'article-journal',
    title: 'CSL Title',
    author: [{ given: 'Jane', family: 'Smith' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    workerManager = createMockWorkerManager({
      entries: [sampleBibLaTeXEntry],
      parseErrors: [],
    });

    vault = createMockVault();

    // Default: file exists in vault
    const mockFile = new TFile();
    (mockFile as any).path = defaultPath;
    (mockFile as any).name = 'library.bib';
    (mockFile as any).stat = { mtime: fixedMtime };
    vault.getAbstractFileByPath.mockReturnValue(mockFile);
    vault.read.mockResolvedValue('@article{doe2024, title={Test}}');
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('stores the id', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      expect(source.id).toBe(defaultId);
    });
  });

  // -----------------------------------------------------------------------
  // load()
  // -----------------------------------------------------------------------

  describe('load()', () => {
    it('loads BibLaTeX entries successfully', async () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.BibLaTeX,
        workerManager,
        vault as any,
      );

      const result = await source.load();

      expect(result.sourceId).toBe(defaultId);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toBeInstanceOf(EntryBibLaTeXAdapter);
      expect(result.modifiedAt).toEqual(new Date(fixedMtime));
      expect(result.parseErrors).toEqual([]);
    });

    it('loads CSL-JSON entries successfully', async () => {
      const cslWorker = createMockWorkerManager({
        entries: [sampleCSLEntry],
        parseErrors: [],
      });

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.CslJson,
        cslWorker,
        vault as any,
      );

      vault.read.mockResolvedValue('[{"id":"smith2024"}]');

      const result = await source.load();

      expect(result.sourceId).toBe(defaultId);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toBeInstanceOf(EntryCSLAdapter);
    });

    it('sends correct data to worker', async () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.BibLaTeX,
        workerManager,
        vault as any,
      );

      await source.load();

      expect(workerManager.post).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseRaw: '@article{doe2024, title={Test}}',
          databaseType: DATABASE_FORMATS.BibLaTeX,
        }),
      );
    });

    it('handles backward-compatible array response from worker', async () => {
      const legacyWorker = createMockWorkerManager([sampleBibLaTeXEntry]);

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.BibLaTeX,
        legacyWorker,
        vault as any,
      );

      const result = await source.load();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toBeInstanceOf(EntryBibLaTeXAdapter);
      expect(result.parseErrors).toEqual([]);
    });

    it('propagates parse errors from worker', async () => {
      const errorWorker = createMockWorkerManager({
        entries: [],
        parseErrors: [{ message: 'Bad entry on line 5' }],
      });

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        errorWorker,
        vault as any,
      );

      const result = await source.load();

      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors![0].message).toContain('line 5');
    });

    it('throws when file is not found in vault', async () => {
      vault.getAbstractFileByPath.mockReturnValue(null);

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
      await expect(source.load()).rejects.toThrow(defaultPath);
    });

    it('throws when file is not a TFile instance (e.g. a folder)', async () => {
      // Return a plain object that is NOT an instance of TFile
      vault.getAbstractFileByPath.mockReturnValue({ path: defaultPath });

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('File not found in vault');
    });

    it('throws when file content is empty', async () => {
      vault.read.mockResolvedValue('');

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws when file content is null', async () => {
      vault.read.mockResolvedValue(null);

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws when vault.read fails', async () => {
      vault.read.mockRejectedValue(new Error('Read error'));

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws when worker.post fails', async () => {
      (workerManager.post as jest.Mock).mockRejectedValue(
        new Error('Worker crash'),
      );

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws for unsupported database format', async () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        'hayagriva' as any,
        createMockWorkerManager({
          entries: [sampleBibLaTeXEntry],
          parseErrors: [],
        } as any),
        vault as any,
      );

      await expect(source.load()).rejects.toThrow(
        'Unsupported database format',
      );
    });

    it('includes original error message in re-thrown error', async () => {
      vault.read.mockRejectedValue(new Error('Specific vault read issue'));

      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      await expect(source.load()).rejects.toThrow('Specific vault read issue');
    });
  });

  // -----------------------------------------------------------------------
  // watch()
  // -----------------------------------------------------------------------

  describe('watch()', () => {
    it('registers modify and create event handlers on vault', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      source.watch(jest.fn());

      expect(vault.on).toHaveBeenCalledWith('modify', expect.any(Function));
      expect(vault.on).toHaveBeenCalledWith('create', expect.any(Function));
      expect(vault.on).toHaveBeenCalledTimes(2);
    });

    it('does not register again if watcher already exists', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      source.watch(jest.fn());
      source.watch(jest.fn());

      // vault.on should only have been called twice (modify + create) from first watch
      expect(vault.on).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Watcher already exists'),
      );

      warnSpy.mockRestore();
    });

    it('triggers callback with debounce on modify event for matching file', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const callback = jest.fn();
      source.watch(callback);

      // Extract the 'modify' handler
      const modifyHandler = vault.on.mock.calls.find(
        (call: any[]) => call[0] === 'modify',
      )![1];

      // Simulate file modification with matching path
      modifyHandler({ path: defaultPath });

      expect(callback).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('triggers callback with debounce on create event for matching file', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const callback = jest.fn();
      source.watch(callback);

      const createHandler = vault.on.mock.calls.find(
        (call: any[]) => call[0] === 'create',
      )![1];

      createHandler({ path: defaultPath });

      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('ignores events for non-matching file paths', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const callback = jest.fn();
      source.watch(callback);

      const modifyHandler = vault.on.mock.calls.find(
        (call: any[]) => call[0] === 'modify',
      )![1];

      // File with different path
      modifyHandler({ path: 'some/other/file.bib' });

      jest.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('debounces multiple rapid events into a single callback', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const callback = jest.fn();
      source.watch(callback);

      const modifyHandler = vault.on.mock.calls.find(
        (call: any[]) => call[0] === 'modify',
      )![1];

      modifyHandler({ path: defaultPath });
      jest.advanceTimersByTime(500);
      modifyHandler({ path: defaultPath });
      jest.advanceTimersByTime(500);
      modifyHandler({ path: defaultPath });

      expect(callback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not invoke callback if disposed before debounce fires', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const callback = jest.fn();
      source.watch(callback);

      const modifyHandler = vault.on.mock.calls.find(
        (call: any[]) => call[0] === 'modify',
      )![1];

      modifyHandler({ path: defaultPath });
      source.dispose();

      jest.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // dispose()
  // -----------------------------------------------------------------------

  describe('dispose()', () => {
    it('unregisters all event refs from the vault', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      source.watch(jest.fn());
      source.dispose();

      // Two events registered (modify + create), both should be offref'd
      expect(vault.offref).toHaveBeenCalledTimes(2);
    });

    it('clears the debounce timer', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      const callback = jest.fn();
      source.watch(callback);

      const modifyHandler = vault.on.mock.calls.find(
        (call: any[]) => call[0] === 'modify',
      )![1];

      modifyHandler({ path: defaultPath });
      source.dispose();

      jest.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('sets watchCallback to null', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      source.watch(jest.fn());
      source.dispose();

      // After dispose, eventRefs should be empty
      // Calling dispose again should be safe
      expect(() => source.dispose()).not.toThrow();
    });

    it('is safe to call dispose() without watch()', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      expect(() => source.dispose()).not.toThrow();
      expect(vault.offref).not.toHaveBeenCalled();
    });

    it('is safe to call dispose() multiple times', () => {
      const source = new VaultFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vault as any,
      );

      source.watch(jest.fn());
      source.dispose();
      source.dispose();

      // offref should only have been called for the initial 2 event refs
      expect(vault.offref).toHaveBeenCalledTimes(2);
    });
  });
});
