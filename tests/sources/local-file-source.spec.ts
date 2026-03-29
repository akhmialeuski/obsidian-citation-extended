/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Polyfill TextEncoder/TextDecoder for jsdom environment (Node.js APIs)
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

import * as path from 'path';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the SUT
// ---------------------------------------------------------------------------

const mockFSWatcher = {
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock(
  'obsidian',
  () => {
    class MockFileSystemAdapter {
      getBasePath() {
        return '/vault';
      }
      static readLocalFile = jest.fn();
    }
    return {
      FileSystemAdapter: MockFileSystemAdapter,
    };
  },
  { virtual: true },
);

jest.mock('chokidar', () => ({
  watch: jest.fn(() => mockFSWatcher),
}));

// We do NOT mock 'path' — use the real node module.

import { FileSystemAdapter } from 'obsidian';
import * as chokidar from 'chokidar';
import { LocalFileSource } from '../../src/sources/local-file-source';
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

/** Create a mock WorkerManager with a configurable post() return */
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

/** Encode a string into an ArrayBuffer (mimics what readLocalFile returns) */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const buf = Buffer.from(str, 'utf-8');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** Minimal fake stat object */
function fakeStats(size = 100, mtime = new Date('2024-06-01T00:00:00Z')) {
  return { size, mtime };
}

// ---------------------------------------------------------------------------
// fs.promises.stat mock — controlled per-test
// ---------------------------------------------------------------------------
// Use a container object so jest.mock hoisting can reference it before 'let' init.
const fsMocks = {
  stat: jest.fn(),
};

jest.mock('fs', () => ({
  promises: {
    stat: (...args: any[]) => fsMocks.stat(...args),
  },
}));

// ---------------------------------------------------------------------------
// window.setTimeout / clearTimeout stubs (jsdom may not have them as jest fns)
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

describe('LocalFileSource', () => {
  const defaultId = 'src-local-1';
  const defaultPath = 'refs/library.bib';
  const defaultFormat = DATABASE_FORMATS.BibLaTeX;

  let workerManager: WorkerManager;
  let vaultAdapter: InstanceType<typeof FileSystemAdapter>;

  // Sample entry data returned by the worker
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
    // Reset watcher mock
    mockFSWatcher.on.mockReturnThis();
    mockFSWatcher.close.mockResolvedValue(undefined);

    // Default: worker returns WorkerResponse format
    workerManager = createMockWorkerManager({
      entries: [sampleBibLaTeXEntry],
      parseErrors: [],
    });

    vaultAdapter = new FileSystemAdapter() as any;

    // Default stat: file exists with non-zero size
    fsMocks.stat.mockResolvedValue(fakeStats());

    // Default readLocalFile: returns valid buffer
    (FileSystemAdapter.readLocalFile as jest.Mock).mockResolvedValue(
      stringToArrayBuffer('@article{doe2024, title={Test}}'),
    );
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('stores id, sets up with vault adapter', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      expect(source.id).toBe(defaultId);
    });

    it('accepts null vault adapter', () => {
      const source = new LocalFileSource(
        defaultId,
        '/absolute/path.bib',
        defaultFormat,
        workerManager,
        null,
      );

      expect(source.id).toBe(defaultId);
    });
  });

  // -----------------------------------------------------------------------
  // resolveFilePath (tested indirectly through load/watch)
  // -----------------------------------------------------------------------

  describe('resolveFilePath', () => {
    it('resolves relative path from vault root when vaultAdapter is present', async () => {
      const source = new LocalFileSource(
        defaultId,
        'refs/library.bib',
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await source.load();

      const expectedPath = path.resolve('/vault', 'refs/library.bib');
      expect(fsMocks.stat).toHaveBeenCalledWith(expectedPath);
    });

    it('resolves from "/" when vault adapter is null', async () => {
      const source = new LocalFileSource(
        defaultId,
        'refs/library.bib',
        defaultFormat,
        workerManager,
        null,
      );

      await source.load();

      const expectedPath = path.resolve('/', 'refs/library.bib');
      expect(fsMocks.stat).toHaveBeenCalledWith(expectedPath);
    });

    it('handles absolute paths correctly', async () => {
      const absPath = '/absolute/path/to/lib.bib';
      const source = new LocalFileSource(
        defaultId,
        absPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await source.load();

      // path.resolve with an absolute second arg ignores the base
      expect(fsMocks.stat).toHaveBeenCalledWith(absPath);
    });
  });

  // -----------------------------------------------------------------------
  // load()
  // -----------------------------------------------------------------------

  describe('load()', () => {
    it('loads BibLaTeX entries successfully', async () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.BibLaTeX,
        workerManager,
        vaultAdapter,
      );

      const result = await source.load();

      expect(result.sourceId).toBe(defaultId);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toBeInstanceOf(EntryBibLaTeXAdapter);
      expect(result.modifiedAt).toEqual(fakeStats().mtime);
      expect(result.parseErrors).toEqual([]);
    });

    it('loads CSL-JSON entries successfully', async () => {
      const cslWorker = createMockWorkerManager({
        entries: [sampleCSLEntry],
        parseErrors: [],
      });

      const source = new LocalFileSource(
        defaultId,
        'refs/library.json',
        DATABASE_FORMATS.CslJson,
        cslWorker,
        vaultAdapter,
      );

      (FileSystemAdapter.readLocalFile as jest.Mock).mockResolvedValue(
        stringToArrayBuffer('[{"id":"smith2024"}]'),
      );

      const result = await source.load();

      expect(result.sourceId).toBe(defaultId);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toBeInstanceOf(EntryCSLAdapter);
    });

    it('sends correct databaseType to worker for BibLaTeX', async () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.BibLaTeX,
        workerManager,
        vaultAdapter,
      );

      await source.load();

      expect(workerManager.post).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseType: DATABASE_FORMATS.BibLaTeX,
          databaseRaw: expect.any(String),
        }),
      );
    });

    it('sends correct databaseType to worker for CSL-JSON', async () => {
      const cslWorker = createMockWorkerManager({
        entries: [],
        parseErrors: [],
      });
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.CslJson,
        cslWorker,
        vaultAdapter,
      );

      await source.load();

      expect(cslWorker.post).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseType: DATABASE_FORMATS.CslJson,
        }),
      );
    });

    it('propagates parse errors from worker', async () => {
      const errorWorker = createMockWorkerManager({
        entries: [sampleBibLaTeXEntry],
        parseErrors: [{ message: 'Skipped malformed entry at line 42' }],
      });

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        DATABASE_FORMATS.BibLaTeX,
        errorWorker,
        vaultAdapter,
      );

      const result = await source.load();

      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors![0].message).toContain('line 42');
    });

    it('throws when file stat returns zero size', async () => {
      fsMocks.stat.mockResolvedValue(fakeStats(0));

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws when stat fails (file not found)', async () => {
      fsMocks.stat.mockRejectedValue(new Error('ENOENT: no such file'));

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws when readLocalFile fails', async () => {
      (FileSystemAdapter.readLocalFile as jest.Mock).mockRejectedValue(
        new Error('Permission denied'),
      );

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws when worker.post fails', async () => {
      (workerManager.post as jest.Mock).mockRejectedValue(
        new Error('Worker error'),
      );

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow('Failed to load from');
    });

    it('throws for unsupported database format', async () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        'unknown-format' as any,
        createMockWorkerManager({
          entries: [sampleBibLaTeXEntry],
          parseErrors: [],
        } as any),
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow(
        'Unsupported bibliography format',
      );
    });

    it('includes original error message in thrown error', async () => {
      fsMocks.stat.mockRejectedValue(new Error('Disk read failure'));

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow('Disk read failure');
    });

    it('includes filePath in thrown error message', async () => {
      fsMocks.stat.mockRejectedValue(new Error('Not found'));

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      await expect(source.load()).rejects.toThrow(defaultPath);
    });
  });

  // -----------------------------------------------------------------------
  // watch()
  // -----------------------------------------------------------------------

  describe('watch()', () => {
    it('sets up chokidar watcher on resolved path', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      const callback = jest.fn();
      source.watch(callback);

      const expectedPath = path.resolve('/vault', defaultPath);
      expect(chokidar.watch).toHaveBeenCalledWith(
        expectedPath,
        expect.objectContaining({
          awaitWriteFinish: expect.objectContaining({
            stabilityThreshold: 500,
            pollInterval: 100,
          }),
          ignoreInitial: true,
        }),
      );
    });

    it('registers change and add event handlers', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      source.watch(jest.fn());

      expect(mockFSWatcher.on).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
      expect(mockFSWatcher.on).toHaveBeenCalledWith(
        'add',
        expect.any(Function),
      );
    });

    it('is silently idempotent — does not create a second watcher', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      source.watch(jest.fn());
      source.watch(jest.fn()); // Second call should be silently ignored

      expect(chokidar.watch).toHaveBeenCalledTimes(1);
    });

    it('throws when chokidar.watch throws', () => {
      (chokidar.watch as jest.Mock).mockImplementationOnce(() => {
        throw new Error('chokidar error');
      });

      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      expect(() => source.watch(jest.fn())).toThrow('chokidar error');
    });
  });

  // -----------------------------------------------------------------------
  // triggerCallbackWithDebounce (tested via watch event simulation)
  // -----------------------------------------------------------------------

  describe('debounced callback', () => {
    it('calls the callback after debounce period on "change" event', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      const callback = jest.fn();
      source.watch(callback);

      // Extract the 'change' handler
      const changeHandler = mockFSWatcher.on.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )![1];

      changeHandler(); // Simulate file change

      // Callback should not fire immediately
      expect(callback).not.toHaveBeenCalled();

      // Advance past the 1s debounce
      jest.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('calls the callback after debounce period on "add" event', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      const callback = jest.fn();
      source.watch(callback);

      const addHandler = mockFSWatcher.on.mock.calls.find(
        (call: any[]) => call[0] === 'add',
      )![1];

      addHandler();

      jest.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('debounces multiple rapid changes into a single callback', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      const callback = jest.fn();
      source.watch(callback);

      const changeHandler = mockFSWatcher.on.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )![1];

      // Simulate rapid changes
      changeHandler();
      jest.advanceTimersByTime(500);
      changeHandler();
      jest.advanceTimersByTime(500);
      changeHandler();

      // Not yet fired (last call resets the timer)
      expect(callback).not.toHaveBeenCalled();

      // Advance past debounce from last trigger
      jest.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not call callback if watchCallback is null (after dispose)', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      const callback = jest.fn();
      source.watch(callback);

      const changeHandler = mockFSWatcher.on.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )![1];

      changeHandler(); // Start debounce
      source.dispose(); // Clears callback and timer

      jest.advanceTimersByTime(2000);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // dispose()
  // -----------------------------------------------------------------------

  describe('dispose()', () => {
    it('closes the chokidar watcher', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      source.watch(jest.fn());
      source.dispose();

      expect(mockFSWatcher.close).toHaveBeenCalled();
    });

    it('clears the debounce timer', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      const callback = jest.fn();
      source.watch(callback);

      // Trigger a change to start the debounce timer
      const changeHandler = mockFSWatcher.on.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )![1];
      changeHandler();

      source.dispose();

      // Advance time — callback should NOT fire since timer was cleared
      jest.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('sets watchCallback to null', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      source.watch(jest.fn());
      source.dispose();

      // If we manually trigger the debounce (simulating a race condition),
      // the callback should not fire because watchCallback is null
      jest.advanceTimersByTime(2000);
      // No errors expected
    });

    it('is safe to call dispose() without watch()', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      // Should not throw
      expect(() => source.dispose()).not.toThrow();
    });

    it('is safe to call dispose() multiple times', () => {
      const source = new LocalFileSource(
        defaultId,
        defaultPath,
        defaultFormat,
        workerManager,
        vaultAdapter,
      );

      source.watch(jest.fn());
      source.dispose();
      expect(() => source.dispose()).not.toThrow();
    });
  });
});
