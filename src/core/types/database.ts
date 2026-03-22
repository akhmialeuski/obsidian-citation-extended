/**
 * Known bibliography file format constants.
 * Use these instead of string literals throughout the codebase.
 */
export const DATABASE_FORMATS = {
  CslJson: 'csl-json',
  BibLaTeX: 'biblatex',
  Hayagriva: 'hayagriva',
} as const;

/**
 * Supported bibliography file formats.
 * Derived from DATABASE_FORMATS constants — add new formats there.
 */
export type DatabaseType =
  (typeof DATABASE_FORMATS)[keyof typeof DATABASE_FORMATS];

/** Human-readable labels for database format dropdowns. */
export const DATABASE_TYPE_LABELS: Record<DatabaseType, string> = {
  [DATABASE_FORMATS.CslJson]: 'CSL-JSON',
  [DATABASE_FORMATS.BibLaTeX]: 'BibLaTeX',
  [DATABASE_FORMATS.Hayagriva]: 'Hayagriva (YAML)',
};

export interface DatabaseConfig {
  name: string;
  path: string;
  type: DatabaseType;
}
