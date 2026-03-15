import {
  DataSourceFactory,
  IDataSourceFactory,
} from '../sources/data-source-factory';
import { DataSourceType } from '../data-source';
import { DataSourceError } from '../core/errors';

jest.mock(
  'obsidian',
  () => ({
    FileSystemAdapter: class {},
    Vault: class {},
  }),
  { virtual: true },
);

jest.mock('../sources/local-file-source', () => ({
  LocalFileSource: jest.fn().mockImplementation((id: string) => ({
    id,
    type: 'local',
  })),
}));

jest.mock('../sources/vault-file-source', () => ({
  VaultFileSource: jest.fn().mockImplementation((id: string) => ({
    id,
    type: 'vault',
  })),
}));

describe('DataSourceFactory', () => {
  let factory: IDataSourceFactory;

  beforeEach(() => {
    factory = new DataSourceFactory(null, {} as never, {} as never);
  });

  it('should create LocalFileSource for DataSourceType.LocalFile', () => {
    const source = factory.create(
      {
        type: DataSourceType.LocalFile,
        path: '/some/path.bib',
        format: 'biblatex',
      },
      'source-0',
    );

    expect(source).toBeDefined();
    expect(source.id).toBe('source-0');
  });

  it('should create VaultFileSource for DataSourceType.VaultFile', () => {
    const source = factory.create(
      {
        type: DataSourceType.VaultFile,
        path: 'vault/path.json',
        format: 'csl-json',
      },
      'source-1',
    );

    expect(source).toBeDefined();
    expect(source.id).toBe('source-1');
  });

  it('should throw DataSourceError for unknown types', () => {
    expect(() =>
      factory.create(
        {
          type: 'unknown' as DataSourceType,
          path: 'x',
          format: 'biblatex',
        },
        'source-x',
      ),
    ).toThrow(DataSourceError);
  });
});
