import {
  DataSourceRegistry,
  IDataSourceRegistry,
} from '../../src/sources/data-source-registry';
import { DataSourceError } from '../../src/core/errors';
import { DataSource } from '../../src/data-source';

function mockSource(id: string): DataSource {
  return {
    id,
    load: jest.fn(),
    watch: jest.fn(),
    dispose: jest.fn(),
  };
}

describe('DataSourceRegistry', () => {
  let registry: IDataSourceRegistry;

  beforeEach(() => {
    registry = new DataSourceRegistry();
  });

  describe('register', () => {
    it('registers a new source type', () => {
      registry.register('test-type', (def, id) => mockSource(id));
      expect(registry.has('test-type')).toBe(true);
    });

    it('throws when registering a duplicate type', () => {
      registry.register('test-type', (def, id) => mockSource(id));
      expect(() =>
        registry.register('test-type', (def, id) => mockSource(id)),
      ).toThrow(DataSourceError);
    });

    it('allows registering multiple different types', () => {
      registry.register('type-a', (def, id) => mockSource(id));
      registry.register('type-b', (def, id) => mockSource(id));
      expect(registry.has('type-a')).toBe(true);
      expect(registry.has('type-b')).toBe(true);
    });
  });

  describe('create', () => {
    it('creates a source using the registered creator', () => {
      const creator = jest.fn((def, id) => mockSource(id));
      registry.register('my-type', creator);

      const def = {
        type: 'my-type',
        path: '/test.bib',
        format: 'biblatex' as const,
      };
      const source = registry.create(def, 'src-1');

      expect(creator).toHaveBeenCalledWith(def, 'src-1');
      expect(source.id).toBe('src-1');
    });

    it('throws DataSourceError for unregistered type', () => {
      expect(() =>
        registry.create(
          { type: 'missing', path: '/x', format: 'biblatex' as const },
          'src-0',
        ),
      ).toThrow(DataSourceError);
    });

    it('error message includes the unknown type and supported list', () => {
      registry.register('local-file', (def, id) => mockSource(id));

      try {
        registry.create(
          { type: 'network', path: '/x', format: 'csl-json' as const },
          'src-0',
        );
        fail('Expected DataSourceError');
      } catch (e) {
        expect((e as DataSourceError).message).toContain('network');
        expect((e as DataSourceError).message).toContain('local-file');
      }
    });
  });

  describe('getSupportedTypes', () => {
    it('returns empty array when nothing is registered', () => {
      expect(registry.getSupportedTypes()).toEqual([]);
    });

    it('returns all registered types', () => {
      registry.register('alpha', (def, id) => mockSource(id));
      registry.register('beta', (def, id) => mockSource(id));

      const types = registry.getSupportedTypes();
      expect(types).toContain('alpha');
      expect(types).toContain('beta');
      expect(types).toHaveLength(2);
    });
  });

  describe('has', () => {
    it('returns false for unregistered type', () => {
      expect(registry.has('nope')).toBe(false);
    });

    it('returns true after registration', () => {
      registry.register('yes', (def, id) => mockSource(id));
      expect(registry.has('yes')).toBe(true);
    });
  });
});
