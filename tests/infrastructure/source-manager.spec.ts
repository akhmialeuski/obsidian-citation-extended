import { SourceManager } from '../../src/infrastructure/source-manager';
import type { DatabaseConfig } from '../../src/core';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeMockFactory() {
  return {
    create: jest.fn((def, id) => ({
      id,
      load: jest.fn(() =>
        Promise.resolve({
          sourceId: id,
          entries: [{ id: 'key1', _sourceDatabase: undefined }],
          parseErrors: [],
        }),
      ),
      watch: jest.fn(),
      dispose: jest.fn(),
    })),
  };
}

function makeDb(
  name: string,
  path = '/test.bib',
  type: DatabaseConfig['type'] = 'biblatex',
  id?: string,
): DatabaseConfig {
  return { id, name, path, type };
}

describe('SourceManager', () => {
  // Suppress console.warn noise from expected "database missing stable id" messages.
  // Tests intentionally exercise the id-absent fallback path.
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('syncSources', () => {
    it('creates sources from database config', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('Zotero', '/zotero.bib')]);

      expect(factory.create).toHaveBeenCalledTimes(1);
      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/zotero.bib',
          format: 'biblatex',
        }),
        expect.stringContaining('Zotero'),
      );
    });

    it('preserves existing sources on re-sync with same config', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('Zotero', '/zotero.bib')]);
      manager.syncSources([makeDb('Zotero', '/zotero.bib')]);

      // Should only create once — second sync reuses the existing source
      expect(factory.create).toHaveBeenCalledTimes(1);
    });

    it('disposes removed sources', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('Zotero', '/zotero.bib')]);
      const createdSource = factory.create.mock.results[0].value;

      manager.syncSources([]); // Remove all

      expect(createdSource.dispose).toHaveBeenCalled();
    });

    it('adds new sources and keeps existing ones', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('Zotero', '/zotero.bib')]);
      manager.syncSources([
        makeDb('Zotero', '/zotero.bib'),
        makeDb('Mendeley', '/mendeley.bib'),
      ]);

      expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('recreates source when db.type changes (new key format includes type)', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('Zotero', '/library.bib', 'biblatex')]);
      const firstSource = factory.create.mock.results[0].value;

      // Change format from biblatex to csl-json (same name and path)
      manager.syncSources([makeDb('Zotero', '/library.bib', 'csl-json')]);

      // Old source should be disposed, new one created
      expect(firstSource.dispose).toHaveBeenCalled();
      expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('uses db.id in key when available instead of db.name', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      // With id
      manager.syncSources([
        makeDb('Zotero', '/lib.bib', 'biblatex', 'db-123-abc'),
      ]);
      expect(factory.create).toHaveBeenCalledTimes(1);

      // Re-sync with same id but different name — should preserve source
      manager.syncSources([
        makeDb('Renamed Zotero', '/lib.bib', 'biblatex', 'db-123-abc'),
      ]);
      expect(factory.create).toHaveBeenCalledTimes(1); // Not recreated
    });

    it('updates databaseName on existing source after rename', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([
        makeDb('Old Name', '/lib.bib', 'biblatex', 'db-123-abc'),
      ]);
      const resultsBefore = await manager.loadAll();
      expect(resultsBefore[0].databaseName).toBe('Old Name');

      // Rename the database
      manager.syncSources([
        makeDb('New Name', '/lib.bib', 'biblatex', 'db-123-abc'),
      ]);
      expect(factory.create).toHaveBeenCalledTimes(1); // Source not recreated

      const resultsAfter = await manager.loadAll();
      expect(resultsAfter[0].databaseName).toBe('New Name');
      expect(resultsAfter[0].databaseId).toBe('db-123-abc');
    });

    it('updates databaseId fallback when db has no id and name changes', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      // Without id, name is used as both key and databaseId fallback
      manager.syncSources([makeDb('Alpha', '/a.bib')]);
      const resultsBefore = await manager.loadAll();
      expect(resultsBefore[0].databaseId).toBe('Alpha');
      expect(resultsBefore[0].databaseName).toBe('Alpha');

      // Re-sync with same name to update metadata (key is name-based here)
      manager.syncSources([makeDb('Alpha', '/a.bib')]);
      const resultsAfter = await manager.loadAll();
      expect(resultsAfter[0].databaseName).toBe('Alpha');
    });
  });

  describe('loadAll', () => {
    it('loads from all sources', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('Zotero')]);

      const results = await manager.loadAll();

      expect(results).toHaveLength(1);
      expect(results[0].databaseName).toBe('Zotero');
    });

    it('includes databaseId in results', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([
        makeDb('Zotero', '/test.bib', 'biblatex', 'db-123-abc'),
      ]);

      const results = await manager.loadAll();

      expect(results).toHaveLength(1);
      expect(results[0].databaseId).toBe('db-123-abc');
      expect(results[0].databaseName).toBe('Zotero');
    });

    it('falls back to db.name for databaseId when db.id is not set', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('Zotero')]); // No id

      const results = await manager.loadAll();

      expect(results).toHaveLength(1);
      expect(results[0].databaseId).toBe('Zotero'); // fallback to name
    });

    it('surfaces a failed source as a synthetic result while others succeed', async () => {
      const factory = makeMockFactory();
      // Override second source to fail
      let callCount = 0;
      factory.create = jest.fn((def, id) => {
        callCount++;
        return {
          id,
          load:
            callCount === 2
              ? jest.fn(() => Promise.reject(new Error('fail')))
              : jest.fn(() =>
                  Promise.resolve({
                    sourceId: id,
                    entries: [],
                    parseErrors: [],
                  }),
                ),
          watch: jest.fn(),
          dispose: jest.fn(),
        };
      });

      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('OK'), makeDb('Fail', '/fail.bib')]);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const results = await manager.loadAll();
      consoleSpy.mockRestore();

      // Both the successful source and the synthetic failure result are returned
      expect(results).toHaveLength(2);

      const ok = results.find((r) => r.databaseName === 'OK');
      const failed = results.find((r) => r.databaseName === 'Fail');
      expect(ok).toBeDefined();
      expect(failed).toBeDefined();

      // The failed source surfaces its error as a parseError with no entries
      expect(failed!.entries).toEqual([]);
      expect(failed!.parseErrors).toHaveLength(1);
      expect(failed!.parseErrors[0].message).toBe(
        'Failed to load "Fail": fail',
      );
    });

    it('throws when all sources fail', async () => {
      const factory = {
        create: jest.fn(() => ({
          id: 's1',
          load: jest.fn(() => Promise.reject(new Error('fail'))),
          watch: jest.fn(),
          dispose: jest.fn(),
        })),
      };

      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('Fail')]);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(manager.loadAll()).rejects.toThrow('fail');
      consoleSpy.mockRestore();
    });

    it('threads the abort signal through to each source.load', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('Zotero')]);

      const controller = new AbortController();
      await manager.loadAll(controller.signal);

      const source = factory.create.mock.results[0].value;
      expect(source.load).toHaveBeenCalledWith(controller.signal, undefined);
    });
  });

  describe('API-source lifecycle (fingerprint key)', () => {
    it('preserves a Readwise source when the config is unchanged', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('RW', 'token', 'readwise', 'db-rw')]);
      const first = factory.create.mock.results[0].value;

      // Re-sync with the SAME config: the source must survive so its polling
      // timer and incremental-sync state are not reset on every reload.
      manager.syncSources([makeDb('RW', 'token', 'readwise', 'db-rw')]);

      expect(first.dispose).not.toHaveBeenCalled();
      expect(factory.create).toHaveBeenCalledTimes(1);
    });

    it('recreates a Readwise source when the token changes', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([makeDb('RW', 'old-token', 'readwise', 'db-rw')]);
      const first = factory.create.mock.results[0].value;

      manager.syncSources([makeDb('RW', 'new-token', 'readwise', 'db-rw')]);

      expect(first.dispose).toHaveBeenCalled();
      expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('recreates a Readwise source when filters change', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      const db = makeDb('RW', 'token', 'readwise', 'db-rw');
      manager.syncSources([db]);
      const first = factory.create.mock.results[0].value;

      manager.syncSources([
        { ...db, readwiseFilters: { categories: ['books'] } },
      ]);

      expect(first.dispose).toHaveBeenCalled();
      expect(factory.create).toHaveBeenCalledTimes(2);
    });

    it('never leaks the token into the source key', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      manager.syncSources([
        makeDb('RW', 'super-secret-token', 'readwise', 'db-rw'),
      ]);

      const sourceId = factory.create.mock.calls[0][1] as string;
      expect(sourceId).not.toContain('super-secret-token');
    });
  });

  describe('reloadSources (incremental)', () => {
    it('reloads only the requested source and reuses cached results', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([
        makeDb('A', '/a.bib', 'biblatex', 'db-a'),
        makeDb('B', '/b.bib', 'biblatex', 'db-b'),
      ]);

      // Initial full load populates the per-source result cache.
      await manager.loadAll();
      const sourceA = factory.create.mock.results[0].value;
      const sourceB = factory.create.mock.results[1].value;
      expect(sourceA.load).toHaveBeenCalledTimes(1);
      expect(sourceB.load).toHaveBeenCalledTimes(1);

      const keyA = factory.create.mock.calls[0][1] as string;
      const results = await manager.reloadSources([keyA]);

      // Source A re-loaded, source B served from cache.
      expect(sourceA.load).toHaveBeenCalledTimes(2);
      expect(sourceB.load).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.databaseName).sort()).toEqual(['A', 'B']);
    });

    it('loads sources that have never produced a result', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('A', '/a.bib', 'biblatex', 'db-a')]);

      // No prior loadAll: the source has no cached result, so an incremental
      // reload of a DIFFERENT key must still load it.
      const results = await manager.reloadSources(['no-such-key']);

      const sourceA = factory.create.mock.results[0].value;
      expect(sourceA.load).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
    });

    it('surfaces a failed incremental reload as a synthetic result', async () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([
        makeDb('OK', '/ok.bib', 'biblatex', 'db-ok'),
        makeDb('Fail', '/fail.bib', 'biblatex', 'db-fail'),
      ]);
      await manager.loadAll();

      const failingSource = factory.create.mock.results[1].value;
      failingSource.load.mockRejectedValueOnce(new Error('boom'));
      const failKey = factory.create.mock.calls[1][1] as string;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const results = await manager.reloadSources([failKey]);
      consoleSpy.mockRestore();

      const failed = results.find((r) => r.databaseName === 'Fail');
      expect(failed!.entries).toEqual([]);
      expect(failed!.parseErrors[0].message).toContain('boom');
    });
  });

  describe('initWatchers', () => {
    it('calls watch on all sources', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('Zotero')]);

      const onChange = jest.fn();
      manager.initWatchers(onChange);

      const source = factory.create.mock.results[0].value;
      expect(source.watch).toHaveBeenCalled();
    });

    it('passes the stable source key to the onChange callback', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('Zotero', '/z.bib', 'biblatex', 'db-z')]);

      const onChange = jest.fn();
      manager.initWatchers(onChange);

      // Trigger the watch callback the source received.
      const source = factory.create.mock.results[0].value;
      const watchCallback = source.watch.mock.calls[0][0] as () => void;
      watchCallback();

      const expectedKey = factory.create.mock.calls[0][1] as string;
      expect(onChange).toHaveBeenCalledWith(expectedKey);
    });
  });

  describe('dispose', () => {
    it('disposes all sources', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);
      manager.syncSources([makeDb('A'), makeDb('B', '/b.bib')]);

      manager.dispose();

      const sources = factory.create.mock.results;
      for (const s of sources) {
        expect(s.value.dispose).toHaveBeenCalled();
      }
    });
  });

  describe('makeKey format', () => {
    it('produces different keys for same name/path with different db.type', () => {
      const factory = makeMockFactory();
      const manager = new SourceManager(factory as never);

      // First: biblatex
      manager.syncSources([makeDb('DB', '/lib', 'biblatex')]);
      expect(factory.create).toHaveBeenCalledTimes(1);

      // Change to csl-json — different key, so new source is created
      manager.syncSources([makeDb('DB', '/lib', 'csl-json')]);
      expect(factory.create).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SourceManager Zotero identity', () => {
  function makeZoteroDb(
    overrides: Partial<DatabaseConfig> = {},
  ): DatabaseConfig {
    return {
      id: 'db-zot',
      name: 'Zotero live',
      type: 'csl-json',
      path: 'http://127.0.0.1:23119/better-bibtex/collection?/0/AB.json',
      sourceType: 'zotero',
      ...overrides,
    };
  }

  it('recreates the source when zoteroImportAnnotations is toggled', () => {
    const factory = makeMockFactory();
    const manager = new SourceManager(factory as never);

    manager.syncSources([makeZoteroDb({ zoteroImportAnnotations: false })]);
    const first = factory.create.mock.results[0].value as {
      dispose: jest.Mock;
    };
    manager.syncSources([makeZoteroDb({ zoteroImportAnnotations: true })]);

    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(first.dispose).toHaveBeenCalled();
  });

  it('keeps the source when the annotation flag is unchanged', () => {
    const factory = makeMockFactory();
    const manager = new SourceManager(factory as never);

    manager.syncSources([makeZoteroDb({ zoteroImportAnnotations: true })]);
    manager.syncSources([makeZoteroDb({ zoteroImportAnnotations: true })]);

    expect(factory.create).toHaveBeenCalledTimes(1);
  });
});
