import { DataSource, DataSourceLoadResult } from '../data-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from '../core/readwise/readwise-api-client';
import {
  ReadwiseEntryData,
  ReadwiseMode,
} from '../core/adapters/readwise-adapter';
import { DATABASE_FORMATS, convertToEntries } from '../core';
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
    readwiseUrl: book.readwise_url,
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
 * Supports two internal modes:
 * - `readwise-highlights` — books with nested highlights via the v2 Export API.
 * - `reader-documents` — documents via the Reader v3 API.
 *
 * Follows the same worker pipeline as file-based sources:
 * API response -> ReadwiseEntryData[] -> JSON.stringify -> Worker ->
 * parseReadwise -> EntryData[] -> convertToEntries -> ReadwiseAdapter[]
 *
 * Unlike file-based sources, this source has no watch/push mechanism;
 * data is loaded on demand when {@link load} is called.
 */
export class ReadwiseSource implements DataSource {
  constructor(
    public readonly id: string,
    private client: ReadwiseApiClient,
    private mode: ReadwiseMode,
    private loadWorker: WorkerManager,
    private options?: { updatedAfter?: string },
  ) {}

  /**
   * Fetch entries from the Readwise API, serialize them, and process
   * through the worker pipeline (same flow as LocalFileSource).
   */
  async load(): Promise<DataSourceLoadResult> {
    try {
      const entryDataArray = await this.fetchEntryData();

      // Serialize to JSON for the worker (same pattern as file-based sources)
      const raw = JSON.stringify(entryDataArray);

      // Post to worker for parsing
      const result = await this.loadWorker.post({
        databaseRaw: raw,
        databaseType: DATABASE_FORMATS.Readwise,
      });

      return {
        sourceId: this.id,
        entries: convertToEntries(DATABASE_FORMATS.Readwise, result.entries),
        modifiedAt: new Date(),
        parseErrors: result.parseErrors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `ReadwiseSource: Failed to load from Readwise API: ${message}`,
      );
      throw new Error(`Failed to load from Readwise API: ${message}`);
    }
  }

  /**
   * Fetch data from the appropriate Readwise API endpoint and convert
   * to normalized ReadwiseEntryData objects.
   */
  private async fetchEntryData(): Promise<ReadwiseEntryData[]> {
    if (this.mode === 'readwise-highlights') {
      const books = await this.client.fetchExportBooks({
        updatedAfter: this.options?.updatedAfter,
      });
      return books.map((book) => toEntryDataFromExport(book));
    } else {
      const documents = await this.client.fetchReaderDocuments({
        updatedAfter: this.options?.updatedAfter,
      });
      // Filter out child documents (those with a parent_id)
      const topLevel = documents.filter((doc) => doc.parent_id === null);
      return topLevel.map((doc) => toEntryDataFromReader(doc));
    }
  }

  /**
   * No-op — Readwise has no push notification mechanism for desktop plugins.
   * The plugin relies on manual sync or periodic reload.
   */
  watch(_callback: () => void): void {
    // Intentionally empty: Readwise API does not support push notifications
  }

  /** Clean up resources. No-op for an API-based source. */
  dispose(): void {
    // No resources to clean up for API-based source
  }
}
