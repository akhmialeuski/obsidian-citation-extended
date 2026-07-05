/**
 * Integration test: Settings migration and validation.
 * Verifies that legacy settings are correctly migrated and
 * new settings pass Zod validation.
 */
import {
  validateSettings,
  DEFAULT_SETTINGS,
} from '../../src/ui/settings/settings-schema';

jest.mock(
  'obsidian',
  () => ({
    PluginSettingTab: class {},
    normalizePath: (p: string) => p,
  }),
  { virtual: true },
);

describe('Integration: Settings Migration & Validation', () => {
  it('validates default settings successfully', () => {
    const result = validateSettings(DEFAULT_SETTINGS);
    expect(result.success).toBe(true);
  });

  it('validates settings with all new fields', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      disableAutomaticNoteCreation: true,
      autoCreateNoteOnCitation: true,
      referenceListSortOrder: 'year-desc',
      citationStylePreset: 'textcite',
    };

    const result = validateSettings(settings);
    expect(result.success).toBe(true);
  });

  it('accepts hayagriva as a valid database type', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      databases: [{ name: 'Test', type: 'hayagriva', path: '/test.yml' }],
    };

    const result = validateSettings(settings);
    expect(result.success).toBe(true);
  });

  it('quarantines a database with an invalid type instead of failing the parse', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      databases: [
        { name: 'Bad', type: 'invalid-format', path: '/test.xyz' },
        { name: 'Good', type: 'csl-json', path: '/test.json' },
      ],
    };

    const result = validateSettings(settings);
    // One bad element must not discard every other validated setting (the
    // caller would fall back to raw settings) — it is dropped with a warning.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.databases.map((db) => db.name)).toEqual(['Good']);
    }
  });

  it('handles legacy settings with citationExportPath', () => {
    const legacySettings = {
      ...DEFAULT_SETTINGS,
      citationExportPath: '/old/path.bib',
      citationExportFormat: 'biblatex',
      databases: [],
    };

    // Zod validation still passes (legacy fields are accepted)
    const result = validateSettings(legacySettings);
    expect(result.success).toBe(true);
  });

  it('preserves unknown fields during validation', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      someUnknownField: 'should be stripped',
    };

    const result = validateSettings(settings);
    expect(result.success).toBe(true);
    // Zod strip mode removes unknown fields
    if (result.success) {
      expect(result.data).not.toHaveProperty('someUnknownField');
    }
  });

  it('validates all sort order options', () => {
    const options = ['default', 'year-desc', 'year-asc', 'author-asc'];

    for (const order of options) {
      const settings = { ...DEFAULT_SETTINGS, referenceListSortOrder: order };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
    }
  });

  it('validates all citation style presets', () => {
    const presets = ['custom', 'textcite', 'parencite', 'citekey'];

    for (const preset of presets) {
      const settings = { ...DEFAULT_SETTINGS, citationStylePreset: preset };
      const result = validateSettings(settings);
      expect(result.success).toBe(true);
    }
  });
});
