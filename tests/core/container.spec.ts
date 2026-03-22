import {
  DataSourceFactory,
  IDataSourceFactory,
} from '../../src/sources/data-source-factory';
import { DATA_SOURCE_TYPES } from '../../src/data-source';
import { DataSourceError } from '../../src/core/errors';
import {
  DataSourceRegistry,
  IDataSourceRegistry,
} from '../../src/sources/data-source-registry';

describe('DataSourceFactory', () => {
  let registry: IDataSourceRegistry;
  let factory: IDataSourceFactory;

  beforeEach(() => {
    registry = new DataSourceRegistry();
    registry.register(DATA_SOURCE_TYPES.LocalFile, (def, id) => ({
      id,
      load: jest.fn(),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));
    registry.register(DATA_SOURCE_TYPES.VaultFile, (def, id) => ({
      id,
      load: jest.fn(),
      watch: jest.fn(),
      dispose: jest.fn(),
    }));
    factory = new DataSourceFactory(registry);
  });

  it('should create source for DATA_SOURCE_TYPES.LocalFile', () => {
    const source = factory.create(
      {
        type: DATA_SOURCE_TYPES.LocalFile,
        path: '/some/path.bib',
        format: 'biblatex',
      },
      'source-0',
    );

    expect(source).toBeDefined();
    expect(source.id).toBe('source-0');
  });

  it('should create source for DATA_SOURCE_TYPES.VaultFile', () => {
    const source = factory.create(
      {
        type: DATA_SOURCE_TYPES.VaultFile,
        path: 'vault/path.json',
        format: 'csl-json',
      },
      'source-1',
    );

    expect(source).toBeDefined();
    expect(source.id).toBe('source-1');
  });

  it('should throw DataSourceError for unregistered types', () => {
    expect(() =>
      factory.create(
        {
          type: 'unknown-type',
          path: 'x',
          format: 'biblatex',
        },
        'source-x',
      ),
    ).toThrow(DataSourceError);
  });
});
