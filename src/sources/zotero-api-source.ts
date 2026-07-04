import {
  DataSource,
  DataSourceLoadOptions,
  DataSourceLoadResult,
} from '../data-source';
import {
  DATABASE_FORMATS,
  convertToEntries,
  buildZoteroApiEntries,
  ZoteroAbortError,
} from '../core';
import type { ParseErrorInfo, ZoteroApiEntryData } from '../core';
import type { ZoteroLocalApiClient, ZoteroApiScope } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import { createLinkedAbortController, PeriodicSync } from './source-utils';

/** Versioned on-disk cache of the last successful fetch. */
interface ZoteroApiCacheStateV1 {
  version: 1;
  /** Pre-built entry DTOs (the same shape the adapter consumes). */
  entries: ZoteroApiEntryData[];
  /** Zotero library version at fetch time, or null. */
  libraryVersion: number | null;
}

/**
 * Data source backed by the **native Zotero local API** (Zotero 7+) — no
 * Better BibTeX required. Items are fetched from the local HTTP server
 * (`http://127.0.0.1:23119/api/`), converted to self-contained entry DTOs
 * (citekey resolution, CSL payload, attachment file synthesis, collection
 * names), and wrapped in adapters:
 *
 *   local API JSON -> buildZoteroApiEntries -> convertToEntries('zotero-api')
 *
 * Citekeys resolve from the native `citationKey` field (Zotero 7.0.31+),
 * a legacy `Citation Key:` line in Extra, or a generated fallback — so the
 * source works with or without Better BibTeX installed.
 *
 * **Offline cache:** the last successful fetch is cached on disk (as DTOs).
 * If Zotero is closed on a later load, the cache keeps the library usable.
 *
 * **Periodic sync:** no file to watch, so the source optionally polls on a
 * configurable interval (same mechanism as the Better BibTeX source).
 */
export class ZoteroApiSource implements DataSource {
  private abortController: AbortController | null = null;
  private readonly poller: PeriodicSync | null;

  constructor(
    public readonly id: string,
    private client: ZoteroLocalApiClient,
    private scope: ZoteroApiScope,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    /** Current periodic-sync interval in ms (0 = disabled); read each cycle. */
    syncIntervalProvider?: () => number,
  ) {
    this.poller = syncIntervalProvider
      ? new PeriodicSync(syncIntervalProvider, 'ZoteroApiSource')
      : null;
  }

  async load(
    externalSignal?: AbortSignal,
    _options?: DataSourceLoadOptions,
  ): Promise<DataSourceLoadResult> {
    this.abortController?.abort();
    const controller = createLinkedAbortController(externalSignal);
    this.abortController = controller;
    const signal = controller.signal;

    try {
      let dtos: ZoteroApiEntryData[];
      let libraryVersion: number | null = null;
      const priorErrors: ParseErrorInfo[] = [];

      try {
        const library = await this.client.fetchLibrary(this.scope, signal);
        dtos = buildZoteroApiEntries(library);
        libraryVersion = library.libraryVersion;
        await this.writeCache(dtos, libraryVersion);
      } catch (error) {
        // A cancelled load is not a failure — let the caller's abort logic run.
        if (error instanceof ZoteroAbortError || signal.aborted) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        const cached = await this.readCache();
        if (!cached) {
          throw new Error(`Failed to load from Zotero local API: ${message}`);
        }
        console.warn(
          `ZoteroApiSource: Zotero unavailable, using cached library (${message})`,
        );
        dtos = cached.entries;
        priorErrors.push({
          message: `Zotero unavailable (using cache): ${message}`,
        });
      }

      const entries = convertToEntries(
        DATABASE_FORMATS.ZoteroApi,
        dtos as never,
      );

      return {
        sourceId: this.id,
        entries,
        modifiedAt: new Date(),
        parseErrors: priorErrors,
      };
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  /** Read and validate the cache file, or null when missing/corrupt. */
  private async readCache(): Promise<ZoteroApiCacheStateV1 | null> {
    if (!this.fileSystem || !this.cachePath) return null;
    try {
      if (!(await this.fileSystem.exists(this.cachePath))) return null;
      const parsed: unknown = JSON.parse(
        await this.fileSystem.readFile(this.cachePath),
      );
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed as { version?: unknown }).version === 1 &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ) {
        return parsed as ZoteroApiCacheStateV1;
      }
    } catch {
      // Missing or corrupt cache behaves exactly like no cache.
    }
    return null;
  }

  /** Persist the fetched DTOs for offline use (best-effort). */
  private async writeCache(
    entries: ZoteroApiEntryData[],
    libraryVersion: number | null,
  ): Promise<void> {
    if (!this.fileSystem || !this.cachePath) return;
    try {
      await this.fileSystem.writeFile(
        this.cachePath,
        JSON.stringify({
          version: 1,
          entries,
          libraryVersion,
        } satisfies ZoteroApiCacheStateV1),
      );
    } catch {
      // Cache write failure is not critical.
    }
  }

  watch(callback: () => void): void {
    this.poller?.start(callback);
  }

  dispose(): void {
    this.poller?.stop();
    this.abortController?.abort();
    this.abortController = null;
  }
}
