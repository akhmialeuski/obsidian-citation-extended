/**
 * A kind of note the plugin can create from a bibliography entry.
 *
 * Only 'literature-note' is implemented for now. The structure allows
 * adding 'reading-note', 'annotation-note', etc. without changes to
 * existing code — just register a new NoteKind and TemplateProfile.
 */
export interface NoteKind {
  /** Unique identifier, e.g. 'literature-note'. */
  readonly id: string;
  /** Human-readable name shown in settings UI. */
  readonly name: string;
  /** Default vault folder for notes of this kind. */
  readonly folder: string;
}

/**
 * Maps a (noteKind, entryType) pair to a specific template.
 *
 * Resolution order in TemplateProfileRegistry:
 * 1. Exact match on noteKind + entryType
 * 2. Wildcard match on noteKind + entryType '*'
 * 3. Default profile
 */
export interface TemplateProfile {
  readonly id: string;
  /** Which NoteKind this profile applies to. */
  readonly noteKind: string;
  /** Entry types this profile handles, e.g. ['article', 'book']. Use ['*'] for all. */
  readonly entryTypes: string[];
  /** Handlebars template for the note title / filename. */
  readonly titleTemplate: string;
  /** Path to the content template file in the vault. */
  readonly contentTemplatePath: string;
}

/** Built-in note kind — the only one implemented currently. */
export const DEFAULT_NOTE_KIND: NoteKind = {
  id: 'literature-note',
  name: 'Literature Note',
  folder: 'Reading notes',
};

/** Default profile — backward compatible with existing settings. */
export const DEFAULT_PROFILE: TemplateProfile = {
  id: 'default',
  noteKind: 'literature-note',
  entryTypes: ['*'],
  titleTemplate: '@{{citekey}}',
  contentTemplatePath: 'citation-content-template.md',
};
