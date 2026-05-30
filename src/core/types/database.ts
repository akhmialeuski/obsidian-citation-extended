/**
 * Known bibliography file format constants.
 * Use these instead of string literals throughout the codebase.
 */
export const DATABASE_FORMATS = {
  CslJson: 'csl-json',
  BibLaTeX: 'biblatex',
  Hayagriva: 'hayagriva',
  Readwise: 'readwise',
} as const;

/**
 * Supported bibliography file formats.
 * Derived from DATABASE_FORMATS constants — add new formats there.
 */
export type DatabaseType =
  (typeof DATABASE_FORMATS)[keyof typeof DATABASE_FORMATS];

/** Human-readable labels for database format dropdowns.
 *  Labels match Zotero / Better BibTeX export format names. */
export const DATABASE_TYPE_LABELS: Record<DatabaseType, string> = {
  [DATABASE_FORMATS.CslJson]: 'Better CSL JSON',
  [DATABASE_FORMATS.BibLaTeX]: 'Better BibTeX',
  [DATABASE_FORMATS.Hayagriva]: 'Hayagriva (YAML)',
  [DATABASE_FORMATS.Readwise]: 'Readwise',
};

/**
 * Optional import filters for a Readwise database. Applied client-side after
 * fetching, since the Readwise API does not support all of these as query
 * parameters. Empty/absent fields mean "no filtering" for that dimension.
 */
export interface ReadwiseFilters {
  /** Keep only entries whose category is in this list (e.g. "books"). */
  categories?: string[];
  /** Keep only entries that have at least one of these tags. */
  tags?: string[];
  /** Keep only highlight-mode entries with at least this many highlights. */
  minHighlights?: number;
  /** Keep only Reader documents in these locations (e.g. "later", "archive"). */
  readerLocations?: string[];
}

export interface DatabaseConfig {
  /** Stable internal identifier. Auto-generated on creation, never changes. */
  id?: string;
  /** User-facing display name. Can be freely renamed without side effects. */
  name: string;
  path: string;
  type: DatabaseType;
  /** Transport type — auto-derived from path if omitted. */
  sourceType?: string;
  /** Readwise-only client-side import filters. */
  readwiseFilters?: ReadwiseFilters;
}

/**
 * Generate a stable, unique database identifier.
 *
 * Format: `db-{timestamp}-{random4}` — generated once on database creation,
 * never shown in UI, cannot be changed by the user.
 */
export function generateDatabaseId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6).padEnd(4, '0');
  return `db-${timestamp}-${random}`;
}
