import { DataSource, DataSourceLoadResult } from '../data-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from '../core/readwise/readwise-api-client';
import { ReadwiseEntryData } from '../core/adapters/readwise-adapter';
import { DATABASE_FORMATS, convertToEntries } from '../core';
import type { ParseErrorInfo } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import { WorkerManager } from '../util';

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Convert a Readwise v2 Export book into the normalized entry data shape. */
function toEntryDataFromExport(book: ReadwiseExportBook): ReadwiseEntryData {
  const highlightsText =
    book.highlights.length > 0
      ? book.highlights.map((h) => h.text).join('\n\n---\n\n')
      : null;

  // Find the latest highlight update timestamp
  const updatedAt =
    book.highlights.length > 0
      ? book.highlights.reduce(
          (latest, h) => (h.updated > latest ? h.updated : latest),
          book.highlights[0].updated,
        )
      : null;

  return {
    mode: 'readwise-highlights',
    rawId: String(book.user_book_id),
    title: book.title,
    author: book.author,
    category: book.category,
    sourceUrl: book.source_url,
    readwiseUrl: book.unique_url ?? book.readwise_url,
    coverImageUrl: book.cover_image_url,
    summary: book.summary ?? book.document_note,
    highlightsText,
    highlightCount: book.num_highlights,
    tags: book.book_tags.map((t) => t.name),
    publishedDate: null,
    updatedAt,
  };
}

/** Convert a Reader v3 document into the normalized entry data shape. */
function toEntryDataFromReader(doc: ReadwiseReaderDocument): ReadwiseEntryData {
  return {
    mode: 'reader-documents',
    rawId: doc.id,
    title: doc.title,
    author: doc.author,
    category: doc.category,
    sourceUrl: doc.source_url,
    readwiseUrl: doc.url,
    coverImageUrl: doc.image_url,
    summary: doc.summary,
    highlightsText: doc.notes || null,
    highlightCount: 0,
    tags: Object.keys(doc.tags),
    publishedDate: doc.published_date,
    updatedAt: doc.updated_at,
  };
}

// ---------------------------------------------------------------------------
// DataSource implementation
// ---------------------------------------------------------------------------

/**
 * Data source that loads bibliography entries from the Readwise API.
 *
 * Fetches BOTH APIs in parallel via Promise.allSettled:
 * - Books with nested highlights via the v2 Export API.
 * - Documents via the Reader v3 API.
 *
 * Follows the same worker pipeline as file-based sources:
 * API response -> ReadwiseEntryData[] -> JSON.stringify -> Worker ->
 * parseReadwise -> EntryData[] -> convertToEntries -> ReadwiseAdapter[]
 *
 * Unlike file-based sources, this source has no watch/push mechanism;
 * data is loaded on demand when {@link load} is called.
 */
export class ReadwiseSource implements DataSource {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly id: string,
    private client: ReadwiseApiClient,
    private loadWorker: WorkerManager,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    private syncIntervalMs?: number,
  ) {}

  /**
   * Fetch entries from the Readwise API, serialize them, and process
   * through the worker pipeline (same flow as LocalFileSource).
   *
   * When a cache file is configured, API results are persisted to disk.
   * If the API is unreachable, the cache is used as a fallback.
   */
  async load(): Promise<DataSourceLoadResult> {
    try {
      const { entries: entryDataArray, errors: fetchErrors } =
        await this.fetchEntryData();

      const raw = JSON.stringify(entryDataArray);

      // Persist to cache for offline/fast startup
      await this.writeCache(raw);

      return this.processRaw(raw, fetchErrors);
    } catch (error) {
      // API failed — try loading from cache
      const cached = await this.readCache();
      if (cached) {
        console.warn('ReadwiseSource: API unavailable, using cached data');
        return this.processRaw(cached, [
          {
            message: `Readwise API unavailable (using cache): ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ]);
      }

      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `ReadwiseSource: Failed to load from Readwise API: ${message}`,
      );
      throw new Error(`Failed to load from Readwise API: ${message}`);
    }
  }

  /**
   * Run serialized ReadwiseEntryData JSON through the worker pipeline.
   */
  private async processRaw(
    raw: string,
    fetchErrors: ParseErrorInfo[],
  ): Promise<DataSourceLoadResult> {
    const result = await this.loadWorker.post({
      databaseRaw: raw,
      databaseType: DATABASE_FORMATS.Readwise,
    });

    const entries = convertToEntries(DATABASE_FORMATS.Readwise, result.entries);

    return {
      sourceId: this.id,
      entries,
      modifiedAt: new Date(),
      parseErrors: [...fetchErrors, ...result.parseErrors],
    };
  }

  /** Write entry data to the cache file (best-effort, errors are silent). */
  private async writeCache(raw: string): Promise<void> {
    if (!this.fileSystem || !this.cachePath) return;
    try {
      await this.fileSystem.writeFile(this.cachePath, raw);
    } catch {
      // Cache write failure is not critical
    }
  }

  /** Read entry data from cache file, or null if unavailable. */
  private async readCache(): Promise<string | null> {
    if (!this.fileSystem || !this.cachePath) return null;
    try {
      if (await this.fileSystem.exists(this.cachePath)) {
        return await this.fileSystem.readFile(this.cachePath);
      }
    } catch {
      // Cache read failure is not critical
    }
    return null;
  }

  /**
   * Fetch data from BOTH Readwise API endpoints in parallel using
   * Promise.allSettled. Merges results and collects errors from
   * any failed endpoint without blocking the other.
   */
  private async fetchEntryData(): Promise<{
    entries: ReadwiseEntryData[];
    errors: ParseErrorInfo[];
  }> {
    const [booksResult, docsResult] = await Promise.allSettled([
      this.client.fetchExportBooks(),
      this.client.fetchReaderDocuments(),
    ]);

    const entries: ReadwiseEntryData[] = [];
    const errors: ParseErrorInfo[] = [];

    if (booksResult.status === 'fulfilled') {
      entries.push(
        ...booksResult.value.map((book) => toEntryDataFromExport(book)),
      );
    } else {
      const msg =
        booksResult.reason instanceof Error
          ? booksResult.reason.message
          : String(booksResult.reason);
      errors.push({ message: `Readwise v2 Export API error: ${msg}` });
    }

    if (docsResult.status === 'fulfilled') {
      // Filter out child documents (those with a parent_id)
      const topLevel = docsResult.value.filter((doc) => doc.parent_id === null);
      entries.push(...topLevel.map((doc) => toEntryDataFromReader(doc)));
    } else {
      const msg =
        docsResult.reason instanceof Error
          ? docsResult.reason.message
          : String(docsResult.reason);
      errors.push({ message: `Readwise Reader v3 API error: ${msg}` });
    }

    return { entries, errors };
  }

  /**
   * Start periodic polling for Readwise data changes.
   * The callback triggers a library reload, same as file-watcher sources.
   */
  watch(callback: () => void): void {
    if (this.pollingTimer || !this.syncIntervalMs) return;

    this.pollingTimer = setInterval(() => {
      console.debug('ReadwiseSource: Periodic sync triggered');
      callback();
    }, this.syncIntervalMs);
  }

  /** Stop the polling timer. */
  dispose(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }
}
