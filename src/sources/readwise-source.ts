import { DataSource, DataSourceLoadResult } from '../data-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from '../core/readwise/readwise-api-client';
import {
  ReadwiseAdapter,
  ReadwiseEntryData,
  ReadwiseMode,
} from '../core/adapters/readwise-adapter';

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
 * Supports two modes:
 * - `readwise-highlights` — books with nested highlights via the v2 Export API.
 * - `reader-documents` — documents via the Reader v3 API.
 *
 * Unlike file-based sources, this source has no watch/push mechanism;
 * data is loaded on demand when {@link load} is called.
 */
export class ReadwiseSource implements DataSource {
  constructor(
    public readonly id: string,
    private client: ReadwiseApiClient,
    private mode: ReadwiseMode,
    private options?: { updatedAfter?: string },
  ) {}

  /**
   * Fetch entries from the Readwise API and convert them to
   * {@link ReadwiseAdapter} instances.
   */
  async load(): Promise<DataSourceLoadResult> {
    try {
      let entries: ReadwiseAdapter[];

      if (this.mode === 'readwise-highlights') {
        const books = await this.client.fetchExportBooks({
          updatedAfter: this.options?.updatedAfter,
        });
        entries = books.map(
          (book) => new ReadwiseAdapter(toEntryDataFromExport(book)),
        );
      } else {
        const documents = await this.client.fetchReaderDocuments({
          updatedAfter: this.options?.updatedAfter,
        });
        // Filter out child documents (those with a parent_id)
        const topLevel = documents.filter((doc) => doc.parent_id === null);
        entries = topLevel.map(
          (doc) => new ReadwiseAdapter(toEntryDataFromReader(doc)),
        );
      }

      return {
        sourceId: this.id,
        entries,
        modifiedAt: new Date(),
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
