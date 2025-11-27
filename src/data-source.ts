import { Entry, DatabaseType } from './types';

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
     * @returns Promise resolving to an array of Entry objects
     * @throws Error if loading fails
     */
    load(): Promise<Entry[]>;

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
 * Strategy for merging entries when multiple sources have the same citekey
 */
export enum MergeStrategy {
    /**
     * Last source wins in case of citekey conflicts
     * Sources are processed in order, later sources override earlier ones
     */
    LastWins = 'last-wins',

    /**
     * First source wins in case of citekey conflicts
     * First occurrence of a citekey is kept, subsequent ones are ignored
     */
    FirstWins = 'first-wins',

    /**
     * Merge by most recent modification date
     * Requires sources to provide modification timestamps
     */
    MostRecent = 'most-recent',
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
    type: 'local-file' | 'vault-file';

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
}
