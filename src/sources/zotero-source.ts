import {
  DataSource,
  DataSourceLoadOptions,
  DataSourceLoadResult,
} from '../data-source';
import { WORKER_TASK_KINDS, convertToEntries, ZoteroAbortError } from '../core';
import type {
  DatabaseType,
  ParseErrorInfo,
  ParseWorkerResponse,
} from '../core';
import type { ZoteroConnectorClient } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import { WorkerManager } from '../util';

/**
 * Versioned on-disk cache: the raw export body plus the format it was fetched
 * in. Lets Obsidian keep serving the library when Zotero is closed, and lets a
 * later format change be detected (a stale-format cache is simply ignored).
 */
interface ZoteroCacheStateV1 {
  version: 1;
  format: DatabaseType;
  raw: string;
}

/**
 * Data source that loads bibliography entries directly from a locally running
 * Zotero via the Better BibTeX pull-export endpoint — no manual file export
 * required. The raw export (Better CSL JSON or BibLaTeX) is parsed through the
 * same worker pipeline as file-based sources:
 *
 *   pull export text -> Worker (loadEntries) -> EntryData[] -> convertToEntries
 *
 * When the export is configured to include notes, Zotero child notes and PDF
 * annotations come through in the `note` field and surface via `{{note}}`.
 *
 * **Offline cache:** the last successful export is cached on disk. If Zotero is
 * not reachable on a later load, the cache is used so the library stays usable.
 *
 * **Periodic sync:** because there is no file to watch, the source optionally
 * polls on a configurable interval (chained setTimeout, re-reading the provider
 * each cycle so settings changes apply without recreating the source).
 */
export class ZoteroSource implements DataSource {
  private pollingTimer: number | null = null;
  private abortController: AbortController | null = null;

  constructor(
    public readonly id: string,
    private client: ZoteroConnectorClient,
    private loadWorker: WorkerManager,
    private format: DatabaseType,
    private exportNotes: boolean,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    /** Current periodic-sync interval in ms (0 = disabled); read each cycle. */
    private syncIntervalProvider?: () => number,
  ) {}

  async load(
    externalSignal?: AbortSignal,
    _options?: DataSourceLoadOptions,
  ): Promise<DataSourceLoadResult> {
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const signal = controller.signal;
    if (externalSignal?.aborted) {
      controller.abort();
    } else {
      externalSignal?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    try {
      let raw: string;
      try {
        raw = await this.client.fetchBibliography({
          exportNotes: this.exportNotes,
          signal,
        });
      } catch (error) {
        // A cancelled load is not a failure — let the caller's abort logic run.
        if (error instanceof ZoteroAbortError || signal.aborted) {
          throw error;
        }
        // Zotero unreachable: fall back to the offline cache if present.
        const cached = await this.readCache();
        if (cached) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `ZoteroSource: Zotero unavailable, using cached export (${message})`,
          );
          return await this.parseRaw(
            cached.raw,
            cached.format,
            [
              {
                message: `Zotero unavailable (using cache): ${message}`,
              },
            ],
            signal,
          );
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load from Zotero: ${message}`);
      }

      // Persist the successful export for offline use (best-effort).
      await this.writeCache(raw);

      return await this.parseRaw(raw, this.format, [], signal);
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  /** Parse a raw export body through the worker pipeline into typed entries. */
  private async parseRaw(
    raw: string,
    format: DatabaseType,
    priorErrors: ParseErrorInfo[],
    signal?: AbortSignal,
  ): Promise<DataSourceLoadResult> {
    const result: ParseWorkerResponse = await this.loadWorker.post(
      {
        kind: WORKER_TASK_KINDS.Parse,
        databaseRaw: raw,
        databaseType: format,
      },
      signal,
    );

    const entries = convertToEntries(format, result.entries);

    return {
      sourceId: this.id,
      entries,
      modifiedAt: new Date(),
      parseErrors: [...priorErrors, ...result.parseErrors],
    };
  }

  /** Read and validate the cache file, or null when missing/corrupt/stale. */
  private async readCache(): Promise<ZoteroCacheStateV1 | null> {
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
        typeof (parsed as { raw?: unknown }).raw === 'string' &&
        typeof (parsed as { format?: unknown }).format === 'string'
      ) {
        return parsed as ZoteroCacheStateV1;
      }
    } catch {
      // Missing or corrupt cache behaves exactly like no cache.
    }
    return null;
  }

  /** Write the raw export to the cache file (best-effort, errors are silent). */
  private async writeCache(raw: string): Promise<void> {
    if (!this.fileSystem || !this.cachePath) return;
    try {
      await this.fileSystem.writeFile(
        this.cachePath,
        JSON.stringify({
          version: 1,
          format: this.format,
          raw,
        } satisfies ZoteroCacheStateV1),
      );
    } catch {
      // Cache write failure is not critical.
    }
  }

  watch(callback: () => void): void {
    if (this.pollingTimer !== null || !this.syncIntervalProvider) return;
    this.scheduleNextSync(callback);
  }

  private scheduleNextSync(callback: () => void): void {
    const interval = this.syncIntervalProvider?.() ?? 0;
    if (interval <= 0) {
      this.pollingTimer = null;
      return;
    }

    console.debug(
      `ZoteroSource: next periodic sync in ${Math.round(interval / 60_000)} min`,
    );
    this.pollingTimer = window.setTimeout(() => {
      const current = this.syncIntervalProvider?.() ?? 0;
      if (current <= 0) {
        this.pollingTimer = null;
        return;
      }
      console.debug('ZoteroSource: Periodic sync triggered');
      callback();
      this.scheduleNextSync(callback);
    }, interval);
  }

  dispose(): void {
    if (this.pollingTimer !== null) {
      window.clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }
}
