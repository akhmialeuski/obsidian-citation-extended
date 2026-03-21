import { z } from 'zod';

export const SettingsSchema = z.object({
  citationExportPath: z.string(),
  citationExportFormat: z.enum(['csl-json', 'biblatex']),
  literatureNoteTitleTemplate: z.string().min(1),
  literatureNoteFolder: z.string(),
  literatureNoteContentTemplate: z.string().min(1),
  literatureNoteContentTemplatePath: z.string().default(''),
  markdownCitationTemplate: z.string().min(1),
  alternativeMarkdownCitationTemplate: z.string().min(1),
  // Reference list sorting
  referenceListSortOrder: z
    .enum(['default', 'year-desc', 'year-asc', 'author-asc'])
    .default('default'),
  autoCreateNoteOnCitation: z.boolean().default(false),
  // Multi-source configuration
  databases: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['csl-json', 'biblatex']),
        path: z.string(),
      }),
    )
    .default([]),
  mergeStrategy: z.enum(['last-wins', 'merge']).optional(),
  disableAutomaticNoteCreation: z.boolean().default(false),
});

export type CitationsPluginSettingsType = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: CitationsPluginSettingsType = {
  citationExportPath: '',
  citationExportFormat: 'csl-json',
  literatureNoteTitleTemplate: '@{{citekey}}',
  literatureNoteFolder: 'Reading notes',
  literatureNoteContentTemplate:
    '---\n' +
    'title: {{quote title}}\n' +
    'authors: {{quote authorString}}\n' +
    'year: {{year}}\n' +
    '---\n\n',
  literatureNoteContentTemplatePath: '',
  markdownCitationTemplate: '[@{{citekey}}]',
  alternativeMarkdownCitationTemplate: '@{{citekey}}',
  referenceListSortOrder: 'default',
  autoCreateNoteOnCitation: false,
  mergeStrategy: 'last-wins',
  databases: [],
  disableAutomaticNoteCreation: false,
};

export function validateSettings(settings: unknown) {
  return SettingsSchema.safeParse(settings);
}
