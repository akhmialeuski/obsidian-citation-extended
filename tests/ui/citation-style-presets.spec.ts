jest.mock(
  'obsidian',
  () => ({
    App: class {},
    Plugin: class {},
    PluginSettingTab: class {},
    Setting: class {},
  }),
  { virtual: true },
);

import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import {
  CITATION_STYLE_PRESETS,
  CITATION_STYLE_PRESET_OPTIONS,
  CitationStylePreset,
} from '../../src/ui/settings/settings-schema';
import { TemplateService } from '../../src/template/template.service';
import { TemplateContext } from '../../src/core';

describe('CitationStylePresets', () => {
  // Shared mock variables that resemble a typical entry
  const mockVariables = {
    citekey: 'smith2023',
    authorString: 'Smith',
    year: '2023',
    title: 'Some Title',
  } as unknown as TemplateContext;

  const multiAuthorVariables = {
    citekey: 'doe2021',
    authorString: 'Doe, Smith',
    year: '2021',
    title: 'Another Title',
  } as unknown as TemplateContext;

  describe('CITATION_STYLE_PRESETS constant', () => {
    it('contains templates for textcite, parencite, and citekey', () => {
      expect(CITATION_STYLE_PRESETS).toHaveProperty('textcite');
      expect(CITATION_STYLE_PRESETS).toHaveProperty('parencite');
      expect(CITATION_STYLE_PRESETS).toHaveProperty('citekey');
    });

    it('does not contain an entry for custom', () => {
      expect(CITATION_STYLE_PRESETS).not.toHaveProperty('custom');
    });

    it('each preset has primary and alternative string templates', () => {
      for (const key of Object.keys(CITATION_STYLE_PRESETS)) {
        const preset =
          CITATION_STYLE_PRESETS[key as keyof typeof CITATION_STYLE_PRESETS];
        expect(typeof preset.primary).toBe('string');
        expect(typeof preset.alternative).toBe('string');
        expect(preset.primary.length).toBeGreaterThan(0);
        expect(preset.alternative.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CITATION_STYLE_PRESET_OPTIONS', () => {
    it('includes custom as first option', () => {
      expect(CITATION_STYLE_PRESET_OPTIONS[0]).toBe('custom');
    });

    it('includes all expected options', () => {
      expect(CITATION_STYLE_PRESET_OPTIONS).toContain('custom');
      expect(CITATION_STYLE_PRESET_OPTIONS).toContain('textcite');
      expect(CITATION_STYLE_PRESET_OPTIONS).toContain('parencite');
      expect(CITATION_STYLE_PRESET_OPTIONS).toContain('citekey');
    });
  });

  describe('CitationsPluginSettings effective template methods', () => {
    let settings: CitationsPluginSettings;

    beforeEach(() => {
      settings = new CitationsPluginSettings();
    });

    it('returns user-defined templates when preset is custom', () => {
      settings.citationStylePreset = 'custom';
      settings.markdownCitationTemplate = '**{{citekey}}**';
      settings.alternativeMarkdownCitationTemplate = '_{{citekey}}_';

      expect(settings.getEffectiveMarkdownCitationTemplate()).toBe(
        '**{{citekey}}**',
      );
      expect(settings.getEffectiveAlternativeMarkdownCitationTemplate()).toBe(
        '_{{citekey}}_',
      );
    });

    it('returns textcite preset templates when preset is textcite', () => {
      settings.citationStylePreset = 'textcite';

      expect(settings.getEffectiveMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.textcite.primary,
      );
      expect(settings.getEffectiveAlternativeMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.textcite.alternative,
      );
    });

    it('returns parencite preset templates when preset is parencite', () => {
      settings.citationStylePreset = 'parencite';

      expect(settings.getEffectiveMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.parencite.primary,
      );
      expect(settings.getEffectiveAlternativeMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.parencite.alternative,
      );
    });

    it('returns citekey preset templates when preset is citekey', () => {
      settings.citationStylePreset = 'citekey';

      expect(settings.getEffectiveMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.citekey.primary,
      );
      expect(settings.getEffectiveAlternativeMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.citekey.alternative,
      );
    });

    it('ignores user-defined templates when a preset is active', () => {
      settings.citationStylePreset = 'textcite';
      settings.markdownCitationTemplate = 'SHOULD_BE_IGNORED';
      settings.alternativeMarkdownCitationTemplate = 'ALSO_IGNORED';

      expect(settings.getEffectiveMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.textcite.primary,
      );
      expect(settings.getEffectiveAlternativeMarkdownCitationTemplate()).toBe(
        CITATION_STYLE_PRESETS.textcite.alternative,
      );
    });
  });

  describe('TemplateService with citation style presets', () => {
    const presets: Exclude<CitationStylePreset, 'custom'>[] = [
      'textcite',
      'parencite',
      'citekey',
    ];

    for (const preset of presets) {
      describe(`preset: ${preset}`, () => {
        let service: TemplateService;
        let settings: CitationsPluginSettings;

        beforeEach(() => {
          settings = new CitationsPluginSettings();
          settings.citationStylePreset = preset;
          service = new TemplateService(settings);
        });

        it('renders primary citation correctly', () => {
          const result = service.getMarkdownCitation(mockVariables, false);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const expected = CITATION_STYLE_PRESETS[preset].primary;
          // Render the expected template manually for verification
          const expectedResult = service.render(expected, mockVariables);
          expect(expectedResult.ok).toBe(true);
          if (expectedResult.ok) {
            expect(result.value).toBe(expectedResult.value);
          }
        });

        it('renders alternative citation correctly', () => {
          const result = service.getMarkdownCitation(mockVariables, true);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const expected = CITATION_STYLE_PRESETS[preset].alternative;
          const expectedResult = service.render(expected, mockVariables);
          expect(expectedResult.ok).toBe(true);
          if (expectedResult.ok) {
            expect(result.value).toBe(expectedResult.value);
          }
        });
      });
    }

    it('textcite primary renders "Author (Year)" format', () => {
      const settings = new CitationsPluginSettings();
      settings.citationStylePreset = 'textcite';
      const service = new TemplateService(settings);

      const result = service.getMarkdownCitation(mockVariables, false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Smith (2023)');
      }
    });

    it('textcite primary works with multiple authors', () => {
      const settings = new CitationsPluginSettings();
      settings.citationStylePreset = 'textcite';
      const service = new TemplateService(settings);

      const result = service.getMarkdownCitation(multiAuthorVariables, false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Doe, Smith (2021)');
      }
    });

    it('parencite primary renders "(Author, Year)" format', () => {
      const settings = new CitationsPluginSettings();
      settings.citationStylePreset = 'parencite';
      const service = new TemplateService(settings);

      const result = service.getMarkdownCitation(mockVariables, false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('(Smith, 2023)');
      }
    });

    it('citekey primary renders "[@citekey]" format', () => {
      const settings = new CitationsPluginSettings();
      settings.citationStylePreset = 'citekey';
      const service = new TemplateService(settings);

      const result = service.getMarkdownCitation(mockVariables, false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('[@smith2023]');
      }
    });

    it('citekey alternative renders "@citekey" format', () => {
      const settings = new CitationsPluginSettings();
      settings.citationStylePreset = 'citekey';
      const service = new TemplateService(settings);

      const result = service.getMarkdownCitation(mockVariables, true);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('@smith2023');
      }
    });

    it('custom preset uses user-defined templates', () => {
      const settings = new CitationsPluginSettings();
      settings.citationStylePreset = 'custom';
      settings.markdownCitationTemplate = '<<{{citekey}}>>';
      settings.alternativeMarkdownCitationTemplate = '!!{{citekey}}!!';
      const service = new TemplateService(settings);

      const primary = service.getMarkdownCitation(mockVariables, false);
      const alternative = service.getMarkdownCitation(mockVariables, true);

      expect(primary.ok).toBe(true);
      expect(alternative.ok).toBe(true);
      if (primary.ok) expect(primary.value).toBe('<<smith2023>>');
      if (alternative.ok) expect(alternative.value).toBe('!!smith2023!!');
    });
  });
});
