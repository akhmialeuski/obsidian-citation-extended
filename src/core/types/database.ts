export type DatabaseType = 'csl-json' | 'biblatex';

export interface DatabaseConfig {
  name: string;
  path: string;
  type: DatabaseType;
}
