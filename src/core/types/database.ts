export const databaseTypes = ['csl-json', 'biblatex'] as const;
export type DatabaseType = (typeof databaseTypes)[number];

export interface DatabaseConfig {
  name: string;
  path: string;
  type: DatabaseType;
}
