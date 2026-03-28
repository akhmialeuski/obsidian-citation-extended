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
  type = 'biblatex' as const,
): DatabaseConfig {
  return { name, path, type };
}

describe('SourceManager', () => {
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

    it('returns successful results and skips failures', async () => {
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

      expect(results).toHaveLength(1);
      expect(results[0].databaseName).toBe('OK');
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
});
