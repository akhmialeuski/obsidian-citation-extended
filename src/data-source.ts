import { Entry, DatabaseType, ParseErrorInfo } from './core';
import { MergeStrategy } from './library/merge-strategy';

/**
 * Known built-in data source transport types.
 * Additional types can be registered via {@link DataSourceRegistry}.
 */
export const DATA_SOURCE_TYPES = {
  LocalFile: 'local-file',
  VaultFile: 'vault-file',
} as const;

/**
 * Discriminates the transport mechanism used by a data source.
 * String-based to allow extensibility via the registry pattern.
 */
export type DataSourceType =
  | (typeof DATA_SOURCE_TYPES)[keyof typeof DATA_SOURCE_TYPES]
  | string;

/**
 * DataSource interface defines a contract for loading bibliography entries
 * from various sources (local files, vault files, network, etc.)
 */
export interface DataSource {
  /**
   * Unique identifier for this data source
   */
  readonly id: string;

  /**
   * Load entries from this data source
   */
  load(): Promise<DataSourceLoadResult>;

  /**
   * Watch for changes and call the callback when data changes
   * @param callback Function to call when source data changes
   */
  watch(callback: () => void): void;

  /**
   * Clean up resources (watchers, connections, etc.)
   * Should be called when the data source is no longer needed
   */
  dispose(): void;
}

/**
 * Configuration for the data source system
 */
export interface DataSourceConfig {
  /**
   * List of data sources to load from
   */
  sources: DataSourceDefinition[];

  /**
   * Strategy to use when merging entries with duplicate citekeys
   */
  mergeStrategy: MergeStrategy;
}

/**
 * Definition of a single data source
 */
export interface DataSourceDefinition {
  /**
   * Type of the data source
   */
  type: DataSourceType;

  /**
   * Path to the data file
   * For local-file: absolute or relative path from vault root
   * For vault-file: path relative to vault root
   */
  path: string;

  /**
   * Format of the bibliography data
   */
  format: DatabaseType;
}

/**
 * Result of loading from a data source, including metadata
 */
export interface DataSourceLoadResult {
  /**
   * Source ID that produced this result
   */
  sourceId: string;

  /**
   * Loaded entries
   */
  entries: Entry[];

  /**
   * Optional modification timestamp for merge strategy
   */
  modifiedAt?: Date;

  /**
   * Non-fatal parse errors encountered during loading.
   * Each error represents an entry that was skipped.
   */
  parseErrors?: ParseErrorInfo[];
}
