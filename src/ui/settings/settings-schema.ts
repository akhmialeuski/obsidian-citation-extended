import { z } from 'zod';

// ---- Citation style presets ------------------------------------------------

export const CITATION_STYLE_PRESET_OPTIONS = [
  'custom',
  'textcite',
  'parencite',
  'citekey',
] as const;

export type CitationStylePreset =
  (typeof CITATION_STYLE_PRESET_OPTIONS)[number];

/** Maps each non-custom preset to its primary and alternative templates. */
export const CITATION_STYLE_PRESETS: Record<
  Exclude<CitationStylePreset, 'custom'>,
  { primary: string; alternative: string }
> = {
  textcite: {
    primary: '{{authorString}} ({{year}})',
    alternative: '[@{{citekey}}]',
  },
  parencite: {
    primary: '({{authorString}}, {{year}})',
    alternative: '[@{{citekey}}]',
  },
  citekey: {
    primary: '[@{{citekey}}]',
    alternative: '@{{citekey}}',
  },
};

// ---- Readwise mode options -------------------------------------------------

export const READWISE_MODE_OPTIONS = [
  'readwise-highlights',
  'reader-documents',
] as const;

export type ReadwiseModeSetting = (typeof READWISE_MODE_OPTIONS)[number];

export const READWISE_MODE_LABELS: Record<ReadwiseModeSetting, string> = {
  'readwise-highlights': 'Readwise Highlights (v2 Export)',
  'reader-documents': 'Readwise Reader Documents (v3)',
};

// ---- Zod schema ------------------------------------------------------------

export const SettingsSchema = z.object({
  citationExportPath: z.string(),
  citationExportFormat: z.enum([
    'csl-json',
    'biblatex',
    'hayagriva',
    'readwise',
  ]),
  literatureNoteTitleTemplate: z.string().min(1),
  literatureNoteFolder: z.string(),
  // Legacy: kept for migration. New installs use only the path field.
  literatureNoteContentTemplate: z.string().optional().default(''),
  literatureNoteContentTemplatePath: z.string().default(''),
  citationStylePreset: z.enum(CITATION_STYLE_PRESET_OPTIONS).default('custom'),
  markdownCitationTemplate: z.string().min(1),
  alternativeMarkdownCitationTemplate: z.string().min(1),
  // Reference list sorting
  referenceListSortOrder: z
    .enum(['default', 'year-desc', 'year-asc', 'author-asc'])
    .default('default'),
  autoCreateNoteOnCitation: z.boolean().default(false),
  literatureNoteLinkDisplayTemplate: z.string().default(''),
  // Multi-source configuration
  databases: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.enum(['csl-json', 'biblatex', 'hayagriva', 'readwise']),
        path: z.string(),
        sourceType: z.string().optional(),
      }),
    )
    .default([]),
  disableAutomaticNoteCreation: z.boolean().default(false),
  // Template profiles for type-specific note templates
  templateProfiles: z
    .array(
      z.object({
        id: z.string(),
        noteKind: z.string(),
        entryTypes: z.array(z.string()),
        titleTemplate: z.string(),
        contentTemplatePath: z.string(),
      }),
    )
    .default([]),
  // ---- Readwise integration ------------------------------------------------
  readwiseApiToken: z.string().default(''),
  readwiseSyncEnabled: z.boolean().default(false),
  readwiseMode: z.enum(READWISE_MODE_OPTIONS).default('readwise-highlights'),
  readwiseLastSyncDate: z.string().default(''),
});

export type CitationsPluginSettingsType = z.infer<typeof SettingsSchema>;

/** Default content template written to a file during migration. */
export const DEFAULT_CONTENT_TEMPLATE =
  '---\n' +
  'title: {{quote title}}\n' +
  'authors: {{quote authorString}}\n' +
  'year: {{year}}\n' +
  '---\n\n';

export const DEFAULT_SETTINGS: CitationsPluginSettingsType = {
  citationExportPath: '',
  citationExportFormat: 'csl-json',
  literatureNoteTitleTemplate: '@{{citekey}}',
  literatureNoteFolder: 'Reading notes',
  literatureNoteContentTemplate: '',
  literatureNoteContentTemplatePath: '',
  citationStylePreset: 'custom',
  markdownCitationTemplate: '[@{{citekey}}]',
  alternativeMarkdownCitationTemplate: '@{{citekey}}',
  referenceListSortOrder: 'default',
  autoCreateNoteOnCitation: false,
  literatureNoteLinkDisplayTemplate: '',
  databases: [],
  disableAutomaticNoteCreation: false,
  templateProfiles: [],
  // Readwise defaults
  readwiseApiToken: '',
  readwiseSyncEnabled: false,
  readwiseMode: 'readwise-highlights',
  readwiseLastSyncDate: '',
};

export function validateSettings(settings: unknown) {
  return SettingsSchema.safeParse(settings);
}
