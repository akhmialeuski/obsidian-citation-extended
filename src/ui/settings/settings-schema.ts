import { z } from 'zod';
import { DATABASE_FORMATS, DatabaseType } from '../../core/types/database';

// Zod-compatible tuple derived from DATABASE_FORMATS constants
const DATABASE_FORMAT_ENUM = Object.values(DATABASE_FORMATS) as [
  DatabaseType,
  ...DatabaseType[],
];

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

// ---- Zod schema ------------------------------------------------------------

export const SettingsSchema = z.object({
  citationExportPath: z.string(),
  citationExportFormat: z.enum(DATABASE_FORMAT_ENUM),
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
  // Character used to replace disallowed filename characters during sanitization.
  // Must not itself contain any disallowed filename characters or forward slashes.
  filenameSanitizationReplacement: z
    .string()
    .max(5)
    .refine((s) => !/[*"\\/<>:|?]/.test(s), {
      message:
        'Replacement must not contain illegal filename characters (* " \\ / < > : | ?)',
    })
    .default('_'),
  autoCreateNoteOnCitation: z.boolean().default(false),
  literatureNoteLinkDisplayTemplate: z.string().default(''),
  // Multi-source configuration
  databases: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.enum(DATABASE_FORMAT_ENUM),
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
  // ---- Note identifier (frontmatter-based lookup) --------------------------
  // When set, the plugin scans vault notes for a matching frontmatter field
  // as a last-resort fallback when filename-based lookup fails.
  noteIdentifierField: z.string().default(''),
  // ---- Readwise integration ------------------------------------------------
  readwiseLastSyncDate: z.string().default(''),
  readwiseSyncIntervalMinutes: z.number().min(0).default(30),
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
  citationExportFormat: DATABASE_FORMATS.CslJson,
  literatureNoteTitleTemplate: '@{{citekey}}',
  literatureNoteFolder: 'Reading notes',
  literatureNoteContentTemplate: '',
  literatureNoteContentTemplatePath: '',
  citationStylePreset: 'custom',
  markdownCitationTemplate: '[@{{citekey}}]',
  alternativeMarkdownCitationTemplate: '@{{citekey}}',
  referenceListSortOrder: 'default',
  filenameSanitizationReplacement: '_',
  autoCreateNoteOnCitation: false,
  literatureNoteLinkDisplayTemplate: '',
  databases: [],
  disableAutomaticNoteCreation: false,
  templateProfiles: [],
  // Note identifier
  noteIdentifierField: '',
  // Readwise defaults
  readwiseLastSyncDate: '',
  readwiseSyncIntervalMinutes: 30,
};

export function validateSettings(settings: unknown) {
  return SettingsSchema.safeParse(settings);
}
