/**
 * Integration test: DataSource lifecycle — register, create, load, dispose.
 * Verifies the full flow from DataSourceRegistry through DataSourceFactory
 * to a mock DataSource implementation.
 */
import { DataSourceRegistry } from '../../src/sources/data-source-registry';
import { DataSourceFactory } from '../../src/sources/data-source-factory';
import { DATA_SOURCE_TYPES } from '../../src/data-source';
import { createMockDataSource } from '../helpers/mock-obsidian';

jest.mock(
  'obsidian',
  () => ({
    FileSystemAdapter: class {},
    normalizePath: (p: string) => p,
  }),
  { virtual: true },
);

describe('Integration: DataSource Lifecycle', () => {
  it('registry → factory → load → dispose flow', async () => {
    const mockEntries = [
      { id: 'entry1', title: 'First' },
      { id: 'entry2', title: 'Second' },
    ];

    const registry = new DataSourceRegistry();
    registry.register(DATA_SOURCE_TYPES.LocalFile, (def, id) =>
      createMockDataSource(id, mockEntries),
    );

    const factory = new DataSourceFactory(registry);
    const source = factory.create(
      {
        type: DATA_SOURCE_TYPES.LocalFile,
        path: '/test.bib',
        format: 'biblatex',
      },
      'source-0',
    );

    expect(source.id).toBe('source-0');

    const result = await source.load();
    expect(result.entries).toHaveLength(2);
    expect(result.sourceId).toBe('source-0');

    source.dispose();
    expect(source.dispose).toHaveBeenCalled();
  });

  it('supports registering and using custom source types', async () => {
    const registry = new DataSourceRegistry();

    // Register a custom "api" source type
    registry.register('api', (def, id) =>
      createMockDataSource(id, [{ id: 'api-entry', title: 'From API' }]),
    );

    expect(registry.getSupportedTypes()).toContain('api');

    const factory = new DataSourceFactory(registry);
    const source = factory.create(
      { type: 'api', path: 'https://example.com/api', format: 'csl-json' },
      'api-source',
    );

    const result = await source.load();
    expect(result.entries[0]).toEqual({ id: 'api-entry', title: 'From API' });
  });

  it('watch callback is callable', () => {
    const registry = new DataSourceRegistry();
    registry.register('test', (def, id) => createMockDataSource(id));

    const factory = new DataSourceFactory(registry);
    const source = factory.create(
      { type: 'test', path: '/x', format: 'biblatex' },
      'src-0',
    );

    const callback = jest.fn();
    source.watch(callback);
    expect(source.watch).toHaveBeenCalledWith(callback);
  });
});
