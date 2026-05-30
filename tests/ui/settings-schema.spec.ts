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

  describe('filenameSanitizationReplacement validation', () => {
    it('accepts underscore (default)', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: '_',
      });
      expect(result.success).toBe(true);
    });

    it('accepts space', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: ' ',
      });
      expect(result.success).toBe(true);
    });

    it('accepts dash', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: '-',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty string', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: '',
      });
      expect(result.success).toBe(true);
    });

    it('accepts multi-character replacement', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: ' - ',
      });
      expect(result.success).toBe(true);
    });

    it('rejects forward slash', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: '/',
      });
      expect(result.success).toBe(false);
    });

    it('rejects colon', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: ':',
      });
      expect(result.success).toBe(false);
    });

    it('rejects asterisk', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: '*',
      });
      expect(result.success).toBe(false);
    });

    it('rejects string containing disallowed character', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: 'a/b',
      });
      expect(result.success).toBe(false);
    });

    it('rejects string longer than 5 characters', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        filenameSanitizationReplacement: 'toolong',
      });
      expect(result.success).toBe(false);
    });

    it('defaults to underscore when field is missing', () => {
      const { filenameSanitizationReplacement: _unused, ...withoutField } =
        DEFAULT_SETTINGS;
      void _unused;
      const result = validateSettings(withoutField);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filenameSanitizationReplacement).toBe('_');
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

  describe('readwiseSyncIntervalMinutes bounds', () => {
    it('accepts the maximum interval (1 week)', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        readwiseSyncIntervalMinutes: 10080,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an interval above the maximum (overflow risk)', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        readwiseSyncIntervalMinutes: 99999,
      });
      expect(result.success).toBe(false);
    });

    it('rejects a negative interval', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        readwiseSyncIntervalMinutes: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('readwiseFilters', () => {
    it('accepts a database with valid readwise filters', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        databases: [
          {
            id: 'db-rw',
            name: 'Readwise',
            type: 'readwise',
            path: 'token',
            sourceType: 'readwise',
            readwiseFilters: {
              categories: ['books'],
              tags: ['ml'],
              minHighlights: 3,
              readerLocations: ['later'],
            },
          },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.databases[0].readwiseFilters?.minHighlights).toBe(3);
      }
    });

    it('accepts databases without readwiseFilters (backward-compat)', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        databases: [
          { id: 'db-1', name: 'X', type: 'biblatex', path: '/x.bib' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects a negative minHighlights', () => {
      const result = validateSettings({
        ...DEFAULT_SETTINGS,
        databases: [
          {
            id: 'db-rw',
            name: 'Readwise',
            type: 'readwise',
            path: 'token',
            readwiseFilters: { minHighlights: -5 },
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });
});
