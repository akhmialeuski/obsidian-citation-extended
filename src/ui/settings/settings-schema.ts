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

// ---- Readwise sync interval bounds -----------------------------------------
// `window.setInterval` overflows beyond ~2^31 ms (~24.8 days / ~35791 minutes),
// wrapping around to fire immediately. Cap the configurable interval well below
// that at one week. 0 disables periodic polling.
export const READWISE_SYNC_INTERVAL_MIN_MINUTES = 0;
export const READWISE_SYNC_INTERVAL_MAX_MINUTES = 60 * 24 * 7; // 10080 = 1 week
export const READWISE_SYNC_INTERVAL_DEFAULT_MINUTES = 30;

// Minimum allowed value for the per-database "minimum highlights" import filter.
export const READWISE_FILTER_MIN_HIGHLIGHTS = 0;

// ---- Library load timeout bounds -------------------------------------------
// Max seconds to wait for all databases to load + parse before aborting. Shared
// by the Zod schema (validation) and the settings UI (clamp + input bounds) so
// there is a single source of truth for the range.
export const LIBRARY_LOAD_TIMEOUT_MIN_SECONDS = 5;
export const LIBRARY_LOAD_TIMEOUT_MAX_SECONDS = 600;
export const LIBRARY_LOAD_TIMEOUT_DEFAULT_SECONDS = 30;

/**
 * Resolve the configured Readwise sync interval (minutes) to milliseconds for
 * `setInterval`, clamped to the valid range. Returns `undefined` when polling
 * is disabled (interval at/below the minimum). Single home for the bound + ms
 * conversion shared by main.ts (read time) and the settings UI.
 */
export function resolveSyncIntervalMs(minutes: number): number | undefined {
  if (minutes <= READWISE_SYNC_INTERVAL_MIN_MINUTES) return undefined;
  return Math.min(minutes, READWISE_SYNC_INTERVAL_MAX_MINUTES) * 60_000;
}

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
        // Readwise-only client-side import filters (optional, backward-compat).
        readwiseFilters: z
          .object({
            categories: z.array(z.string()).optional(),
            tags: z.array(z.string()).optional(),
            minHighlights: z
              .number()
              .min(READWISE_FILTER_MIN_HIGHLIGHTS)
              .optional(),
            readerLocations: z.array(z.string()).optional(),
          })
          .optional(),
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
  readwiseSyncIntervalMinutes: z
    .number()
    .min(READWISE_SYNC_INTERVAL_MIN_MINUTES)
    .max(READWISE_SYNC_INTERVAL_MAX_MINUTES)
    .default(READWISE_SYNC_INTERVAL_DEFAULT_MINUTES),
  // ---- Performance ---------------------------------------------------------
  // Max seconds to wait for all databases to load + parse before aborting.
  // Large or LaTeX-escaped (e.g. Cyrillic \cyrchar) BibTeX libraries can take
  // longer than the old fixed 10s; raise this if you see
  // "Timeout loading citation database".
  libraryLoadTimeoutSeconds: z
    .number()
    .min(LIBRARY_LOAD_TIMEOUT_MIN_SECONDS)
    .max(LIBRARY_LOAD_TIMEOUT_MAX_SECONDS)
    .default(LIBRARY_LOAD_TIMEOUT_DEFAULT_SECONDS),
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
  readwiseSyncIntervalMinutes: READWISE_SYNC_INTERVAL_DEFAULT_MINUTES,
  // Performance
  libraryLoadTimeoutSeconds: LIBRARY_LOAD_TIMEOUT_DEFAULT_SECONDS,
};

export function validateSettings(settings: unknown) {
  return SettingsSchema.safeParse(settings);
}
