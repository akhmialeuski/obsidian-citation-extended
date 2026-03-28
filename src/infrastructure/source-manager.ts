import type { DatabaseConfig } from '../core';
import type { DataSource, DataSourceLoadResult } from '../data-source';
import type { IDataSourceFactory } from '../sources/data-source-factory';
import { DATA_SOURCE_TYPES } from '../data-source';
import type { SourceLoadResult } from './normalization-pipeline';

/**
 * Manages the lifecycle of DataSource instances.
 *
 * Key improvement over the old `LibraryService.createSources()`:
 * - Stable identity: sources are keyed by `name:path`, so unchanged
 *   sources survive across settings reloads.
 * - Settings always reflected: `syncSources()` compares the new config
 *   with the current set and creates/disposes as needed.
 * - Watcher management: centralized instead of inline in LibraryService.
 */
export interface ISourceManager {
  syncSources(databases: DatabaseConfig[]): void;
  loadAll(): Promise<SourceLoadResult[]>;
  initWatchers(onChange: () => void): void;
  dispose(): void;
}

interface ManagedSource {
  source: DataSource;
  databaseName: string;
}

export class SourceManager implements ISourceManager {
  private sources = new Map<string, ManagedSource>();

  constructor(private factory: IDataSourceFactory) {}

  /**
   * Synchronize managed sources with the current database configuration.
   *
   * - New configs get a new DataSource created via the factory.
   * - Removed configs get their DataSource disposed.
   * - Unchanged configs keep their existing DataSource (preserving watchers).
   */
  syncSources(databases: DatabaseConfig[]): void {
    const newKeys = new Set<string>();

    for (let i = 0; i < databases.length; i++) {
      const db = databases[i];
      const key = this.makeKey(db);
      newKeys.add(key);

      if (!this.sources.has(key)) {
        const sourceId = `source-${i}-${db.name}`;
        const source = this.factory.create(
          {
            type: db.sourceType ?? DATA_SOURCE_TYPES.LocalFile,
            path: db.path,
            format: db.type,
          },
          sourceId,
        );
        this.sources.set(key, { source, databaseName: db.name });
        console.debug(`SourceManager: Created source "${db.name}" (${key})`);
      }
    }

    // Dispose sources that are no longer in the config
    for (const [key, managed] of this.sources) {
      if (!newKeys.has(key)) {
        try {
          managed.source.dispose();
        } catch (e) {
          console.error(
            `SourceManager: Error disposing source "${managed.databaseName}":`,
            e,
          );
        }
        this.sources.delete(key);
        console.debug(
          `SourceManager: Removed source "${managed.databaseName}" (${key})`,
        );
      }
    }
  }

  /**
   * Load from all managed sources in parallel.
   * Returns successful results enriched with databaseName.
   * Failed sources are logged but don't block others.
   */
  async loadAll(): Promise<SourceLoadResult[]> {
    const entries = [...this.sources.values()];

    const promises = entries.map(
      async ({ source, databaseName }): Promise<SourceLoadResult | Error> => {
        try {
          console.debug(`SourceManager: Loading from "${databaseName}"`);
          const result: DataSourceLoadResult = await source.load();
          console.debug(
            `SourceManager: Loaded ${result.entries.length} entries from "${databaseName}"`,
          );
          return {
            sourceId: result.sourceId,
            databaseName,
            entries: result.entries,
            parseErrors: result.parseErrors ?? [],
            modifiedAt: result.modifiedAt,
          };
        } catch (error) {
          console.error(
            `SourceManager: Error loading from "${databaseName}":`,
            error,
          );
          return error instanceof Error ? error : new Error(String(error));
        }
      },
    );

    const results = await Promise.all(promises);

    const successful = results.filter(
      (r): r is SourceLoadResult => !(r instanceof Error),
    );
    const errors = results.filter((r): r is Error => r instanceof Error);

    if (successful.length === 0 && errors.length > 0) {
      throw errors[0];
    }

    return successful;
  }

  /**
   * Initialize file watchers on all managed sources.
   */
  initWatchers(onChange: () => void): void {
    for (const { source, databaseName } of this.sources.values()) {
      try {
        source.watch(() => {
          console.debug(`SourceManager: Change detected in "${databaseName}"`);
          onChange();
        });
      } catch (error) {
        console.error(
          `SourceManager: Error setting up watcher for "${databaseName}":`,
          error,
        );
      }
    }
  }

  dispose(): void {
    for (const { source, databaseName } of this.sources.values()) {
      try {
        source.dispose();
      } catch (error) {
        console.error(
          `SourceManager: Error disposing source "${databaseName}":`,
          error,
        );
      }
    }
    this.sources.clear();
    console.debug('SourceManager: Disposed all sources');
  }

  private makeKey(db: DatabaseConfig): string {
    return `${db.name}:${db.path}`;
  }
}
