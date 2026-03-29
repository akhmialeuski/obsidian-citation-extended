import {
  validateSettings,
  DEFAULT_SETTINGS,
} from '../../src/ui/settings/settings-schema';

jest.mock('obsidian', () => ({}), { virtual: true });

describe('SettingsSchema', () => {
  describe('database id field', () => {
    it('accepts databases with id', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        databases: [
          {
            id: 'db-123-abc',
            name: 'Test',
            type: 'csl-json',
            path: '/test.json',
          },
        ],
      };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databases[0].id).toBe('db-123-abc');
      }
    });

    it('accepts databases without id (optional field)', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        databases: [{ name: 'Test', type: 'csl-json', path: '/test.json' }],
      };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databases[0].id).toBeUndefined();
      }
    });
  });

  describe('database sourceType field', () => {
    it('preserves sourceType when provided', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        databases: [
          {
            name: 'Test',
            type: 'csl-json',
            path: '/test.json',
            sourceType: 'vault-file',
          },
        ],
      };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databases[0].sourceType).toBe('vault-file');
      }
    });

    it('accepts databases without sourceType (optional field)', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        databases: [{ name: 'Test', type: 'csl-json', path: '/test.json' }],
      };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databases[0].sourceType).toBeUndefined();
      }
    });
  });

  describe('database id migration', () => {
    it('databases without id pass validation (backward compat)', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        databases: [
          { name: 'Old DB', type: 'biblatex', path: '/old.bib' },
          {
            name: 'New DB',
            type: 'csl-json',
            path: '/new.json',
            id: 'db-1234-xyz',
          },
        ],
      };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databases[0].id).toBeUndefined();
        expect(result.data.databases[1].id).toBe('db-1234-xyz');
      }
    });
  });
});
