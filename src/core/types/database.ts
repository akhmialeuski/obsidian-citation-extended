/**
 * Supported bibliography file formats.
 * New formats (e.g. 'hayagriva') can be added here and handled by a
 * corresponding parser registered in the worker or adapter layer.
 */
export type DatabaseType = 'csl-json' | 'biblatex' | 'hayagriva';

/** Human-readable labels for database format dropdowns. */
export const DATABASE_TYPE_LABELS: Record<DatabaseType, string> = {
  'csl-json': 'CSL-JSON',
  biblatex: 'BibLaTeX',
  hayagriva: 'Hayagriva (YAML)',
};

export interface DatabaseConfig {
  name: string;
  path: string;
  type: DatabaseType;
}
