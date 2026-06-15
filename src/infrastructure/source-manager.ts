import type { DatabaseConfig } from '../core';
import type {
  DataSource,
  DataSourceLoadOptions,
  DataSourceLoadResult,
} from '../data-source';
import type { IDataSourceFactory } from '../sources/data-source-factory';
import { DATA_SOURCE_TYPES } from '../data-source';
import { DATABASE_FORMATS } from '../core';
import type { SourceLoadResult } from './normalization-pipeline';

/**
 * Manages the lifecycle of DataSource instances.
 *
 * Key improvement over the old `LibraryService.createSources()`:
 * - Stable identity: sources are keyed by `transport:type:id:path`, so unchanged
 *   sources survive across settings reloads.
 * - Settings always reflected: `syncSources()` compares the new config
 *   with the current set and creates/disposes as needed.
 * - Watcher management: centralized instead of inline in LibraryService.
 * - Result caching: the last load result of every source is retained, so a
 *   change in ONE source can be reloaded incrementally while the other
 *   sources' entries are reused without re-reading or re-parsing them.
 */
export interface ISourceManager {
  syncSources(databases: DatabaseConfig[]): void;
  loadAll(
    signal?: AbortSignal,
    options?: DataSourceLoadOptions,
  ): Promise<SourceLoadResult[]>;
  reloadSources(
    sourceKeys: string[],
    signal?: AbortSignal,
  ): Promise<SourceLoadResult[]>;
  initWatchers(onChange: (sourceKey: string) => void): void;
  dispose(): void;
}

interface ManagedSource {
  source: DataSource;
  /** Stable internal database identifier for SourceLoadResult propagation. */
  databaseId: string;
  /** User-facing display name. */
  databaseName: string;
  /**
   * Last load result (successful or synthetic-failure), reused by
   * {@link SourceManager.reloadSources} for sources that did not change.
   */
  lastResult?: SourceLoadResult;
  /** Whether the last load failed (lastResult is then a synthetic result). */
  lastFailed?: boolean;
}

/**
 * Non-cryptographic string fingerprint (djb2, base36).
 *
 * Used to fold secrets (the Readwise token lives in `db.path`) and per-source
 * config into the source identity key without leaking their plaintext into
 * debug logs. djb2 is intentionally tiny — collision resistance requirements
 * here are negligible (a handful of databases per vault), so pulling in a
 * crypto dependency would be overkill.
 */
export function configFingerprint(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export class SourceManager implements ISourceManager {
  private sources = new Map<string, ManagedSource>();

  constructor(private factory: IDataSourceFactory) {}

  /**
   * Synchronize managed sources with the current database configuration.
   *
   * - New configs get a new DataSource created via the factory.
   * - Removed configs get their DataSource disposed.
   * - Unchanged configs keep their existing DataSource (preserving watchers),
   *   but mutable metadata (databaseName, databaseId) is refreshed from config.
   *
   * API-based sources (Readwise) include a fingerprint of their credentials
   * and per-database filters in the key, so changing the token or filters
   * recreates the source while an unchanged config preserves it (keeping its
   * polling timer and incremental-sync state alive).
   */
  syncSources(databases: DatabaseConfig[]): void {
    const newKeys = new Set<string>();

    for (let i = 0; i < databases.length; i++) {
      const db = databases[i];
      const key = this.makeKey(db);
      newKeys.add(key);

      const transport = this.resolveTransport(db);

      if (!this.sources.has(key)) {
        const sourceId = key;
        const source = this.factory.create(
          {
            type: transport,
            path: db.path,
            format: db.type,
            databaseId: db.id,
          },
          sourceId,
        );
        const databaseId = db.id ?? db.name;
        if (!db.id) {
          console.warn(
            'Citations: database missing stable id, falling back to name:',
            db.name,
          );
        }
        this.sources.set(key, {
          source,
          databaseId,
          databaseName: db.name,
        });
        console.debug(`SourceManager: Created source "${db.name}" (${key})`);
      } else {
        // Update mutable metadata on existing source (e.g. after user renames a database)
        const managed = this.sources.get(key)!;
        managed.databaseName = db.name;
        managed.databaseId = db.id ?? db.name;
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
   * Returns results enriched with databaseName and databaseId.
   *
   * A source that fails while others succeed is NOT silently dropped: its
   * error is surfaced as a synthetic result with no entries and a single
   * parse error, so it propagates into the library's parseErrors and becomes
   * visible in the UI (instead of console-only). Only when EVERY source fails
   * does this throw, so the library transitions to the Error state rather than
   * reporting an empty success.
   */
  async loadAll(
    signal?: AbortSignal,
    options?: DataSourceLoadOptions,
  ): Promise<SourceLoadResult[]> {
    const managed = [...this.sources.values()];

    const settled = await Promise.all(
      managed.map((m) => this.loadSource(m, signal, options)),
    );

    this.throwWhenAllFailed(managed);

    return settled;
  }

  /**
   * Incrementally reload only the given sources, reusing the cached last
   * result of every other source. Sources that have never produced a result
   * (e.g. just created by syncSources) are loaded too.
   *
   * This is the heart of the incremental pipeline: a watcher event for one
   * database re-reads and re-parses ONLY that database, while the merged
   * library is rebuilt from cached results of the others.
   */
  async reloadSources(
    sourceKeys: string[],
    signal?: AbortSignal,
  ): Promise<SourceLoadResult[]> {
    const keySet = new Set(sourceKeys);
    const managed = [...this.sources.entries()];

    const results = await Promise.all(
      managed.map(([key, m]) => {
        if (keySet.has(key) || !m.lastResult) {
          return this.loadSource(m, signal);
        }
        return Promise.resolve(m.lastResult);
      }),
    );

    this.throwWhenAllFailed([...this.sources.values()]);

    return results;
  }

  /**
   * Load a single managed source, recording the result (or a synthetic
   * failure result) on the ManagedSource for later incremental reuse.
   */
  private async loadSource(
    managed: ManagedSource,
    signal?: AbortSignal,
    options?: DataSourceLoadOptions,
  ): Promise<SourceLoadResult> {
    const { source, databaseId, databaseName } = managed;
    try {
      console.debug(`SourceManager: Loading from "${databaseName}"`);
      const result: DataSourceLoadResult = await source.load(signal, options);
      console.debug(
        `SourceManager: Loaded ${result.entries.length} entries from "${databaseName}"`,
      );
      const loaded: SourceLoadResult = {
        sourceId: result.sourceId,
        databaseId,
        databaseName,
        entries: result.entries,
        parseErrors: result.parseErrors ?? [],
        modifiedAt: result.modifiedAt,
      };
      managed.lastResult = loaded;
      managed.lastFailed = false;
      return loaded;
    } catch (error) {
      // An aborted load must NOT be cached as a failure: the source is fine,
      // the load was just superseded/cancelled. Re-throw so the caller's
      // abort handling deals with it.
      if (signal?.aborted) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `SourceManager: Error loading from "${databaseName}":`,
        error,
      );
      const failed: SourceLoadResult = {
        sourceId: source.id,
        databaseId,
        databaseName,
        entries: [],
        parseErrors: [
          { message: `Failed to load "${databaseName}": ${message}` },
        ],
      };
      managed.lastResult = failed;
      managed.lastFailed = true;
      return failed;
    }
  }

  /**
   * Throw when EVERY managed source is currently in the failed state, so the
   * library load enters the Error state instead of presenting an empty
   * library as a successful load.
   */
  private throwWhenAllFailed(managed: ManagedSource[]): void {
    if (managed.length === 0) return;
    if (managed.every((m) => m.lastFailed)) {
      const firstError = managed[0].lastResult?.parseErrors[0]?.message;
      throw new Error(firstError ?? 'All sources failed to load');
    }
  }

  /**
   * Initialize file watchers on all managed sources. The callback receives
   * the stable source key, so the library can reload only the changed source.
   */
  initWatchers(onChange: (sourceKey: string) => void): void {
    for (const [key, { source, databaseName }] of this.sources.entries()) {
      try {
        source.watch(() => {
          console.debug(`SourceManager: Change detected in "${databaseName}"`);
          onChange(key);
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

  /**
   * Derive the transport type from a database config.
   * API-based formats (Readwise) use their own transport; file-based
   * formats fall back to the explicit sourceType or LocalFile.
   */
  private resolveTransport(db: DatabaseConfig): string {
    if (db.type === DATABASE_FORMATS.Readwise) {
      return DATA_SOURCE_TYPES.Readwise;
    }
    // Zotero uses a file FORMAT (CSL JSON / BibLaTeX) but an HTTP transport, so
    // it is selected by the explicit sourceType rather than the format.
    if (db.sourceType === DATA_SOURCE_TYPES.Zotero) {
      return DATA_SOURCE_TYPES.Zotero;
    }
    return db.sourceType ?? DATA_SOURCE_TYPES.LocalFile;
  }

  private makeKey(db: DatabaseConfig): string {
    const transport = this.resolveTransport(db);
    if (!db.id) {
      console.warn(
        'Citations: database missing stable id in makeKey, falling back to name:',
        db.name,
      );
    }
    const id = db.id ?? db.name;
    if (transport === DATA_SOURCE_TYPES.Readwise) {
      // For API-based sources the path holds the token: never put it in the
      // key verbatim (it would leak into debug logs). Fold token + filters
      // into a fingerprint instead, so changing either recreates the source
      // (the factory snapshots both at creation time) while an unchanged
      // config keeps the source — and its polling timer and incremental
      // sync state — alive across reloads.
      const fp = configFingerprint(
        `${db.path}|${JSON.stringify(db.readwiseFilters ?? null)}`,
      );
      return `${transport}:${db.type}:${id}:fp-${fp}`;
    }
    if (transport === DATA_SOURCE_TYPES.Zotero) {
      // Fold the export-notes flag into the key so toggling it recreates the
      // source (the factory snapshots it at creation time). The URL is not a
      // secret, so it is kept verbatim like a file path.
      return `${transport}:${db.type}:${id}:${db.path}:notes-${
        db.zoteroExportNotes ? 1 : 0
      }`;
    }
    return `${transport}:${db.type}:${id}:${db.path}`;
  }
}
