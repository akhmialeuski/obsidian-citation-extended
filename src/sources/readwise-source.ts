import { DataSource, DataSourceLoadResult } from '../data-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseHighlight,
  ReadwiseReaderDocument,
} from '../core/readwise/readwise-api-client';
import {
  ReadwiseEntryData,
  ReadwiseHighlightItem,
} from '../core/adapters/readwise-adapter';
import { DATABASE_FORMATS, convertToEntries } from '../core';
import type { ParseErrorInfo, ReadwiseFilters } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import { WorkerManager } from '../util';

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Whether a structured highlight carries any meaningful content. */
function isMeaningfulHighlight(item: ReadwiseHighlightItem): boolean {
  return item.text.trim().length > 0 || (item.note ?? '').trim().length > 0;
}

/** Convert a v2 Export highlight into a structured {@link ReadwiseHighlightItem}. */
function exportHighlightToItem(h: ReadwiseHighlight): ReadwiseHighlightItem {
  return {
    id: String(h.id),
    text: h.text ?? '',
    note: h.note || null,
    location: typeof h.location === 'number' ? h.location : null,
    locationType: h.location_type || null,
    color: h.color || null,
    highlightedAt: h.highlighted_at ?? null,
    url: h.url ?? null,
    tags: (h.tags ?? []).map((t) => t.name),
  };
}

/** Convert a Readwise v2 Export book into the normalized entry data shape. */
function toEntryDataFromExport(book: ReadwiseExportBook): ReadwiseEntryData {
  // Structured highlights preserve per-item metadata (note/location/color/tags).
  const highlights = book.highlights
    .map(exportHighlightToItem)
    .filter(isMeaningfulHighlight);

  // Aggregated string kept for backward-compat with {{note}} templates.
  // Guard against highlights missing `text` and drop blank entries so the
  // aggregated string never contains stray `undefined`/empty segments.
  const highlightTexts = book.highlights
    .map((h) => h.text ?? '')
    .filter((text) => text.trim().length > 0);
  const highlightsText =
    highlightTexts.length > 0 ? highlightTexts.join('\n\n---\n\n') : null;

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
    highlights,
    highlightCount: book.num_highlights,
    tags: book.book_tags.map((t) => t.name),
    publishedDate: null,
    updatedAt,
    readableTitle: book.readable_title || null,
    source: book.source || null,
    asin: book.asin,
    documentNote: book.document_note,
    siteName: null,
    wordCount: null,
    readingProgress: null,
    readerLocation: null,
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
    // Reader documents have no separate "readable title"; leave empty rather
    // than duplicating the full title into titleShort.
    readableTitle: null,
    source: doc.source || null,
    asin: null,
    documentNote: doc.notes || null,
    siteName: doc.site_name,
    wordCount: doc.word_count,
    readingProgress: doc.reading_progress ?? null,
    readerLocation: doc.location || null,
  };
}

/** Convert a Reader child document (highlight/note) into a highlight item. */
function readerChildToItem(
  child: ReadwiseReaderDocument,
): ReadwiseHighlightItem {
  return {
    id: child.id,
    text: child.content ?? '',
    note: child.notes || null,
    location: null,
    locationType: null,
    color: null,
    highlightedAt: child.created_at ?? null,
    url: child.source_url || child.url || null,
    tags: Object.keys(child.tags ?? {}),
  };
}

/** Result of merging Reader child documents into their parents. */
interface MergedReaderResult {
  entries: ReadwiseEntryData[];
  /** Number of child documents whose parent was not in the fetched set. */
  orphanCount: number;
}

/**
 * Merge Reader v3 child documents (highlights/notes, identified by a non-null
 * `parent_id`) into their parent document's structured highlights, instead of
 * dropping them. Children whose parent is absent from the fetched set are kept
 * as standalone top-level entries so no user data is silently lost.
 *
 * Deterministic: preserves API result order for parents and children; performs
 * no date-based sorting and uses no non-deterministic APIs.
 */
function mergeReaderChildren(
  docs: ReadwiseReaderDocument[],
): MergedReaderResult {
  const parents = docs.filter((doc) => doc.parent_id === null);
  const parentIds = new Set(parents.map((doc) => doc.id));

  const childrenByParent = new Map<string, ReadwiseReaderDocument[]>();
  const orphans: ReadwiseReaderDocument[] = [];

  for (const doc of docs) {
    if (doc.parent_id === null) continue;
    if (parentIds.has(doc.parent_id)) {
      const siblings = childrenByParent.get(doc.parent_id) ?? [];
      siblings.push(doc);
      childrenByParent.set(doc.parent_id, siblings);
    } else {
      orphans.push(doc);
    }
  }

  const entries: ReadwiseEntryData[] = [];

  for (const parent of parents) {
    const data = toEntryDataFromReader(parent);
    const childHighlights = (childrenByParent.get(parent.id) ?? [])
      .map(readerChildToItem)
      .filter(isMeaningfulHighlight);

    if (childHighlights.length > 0) {
      data.highlights = [...(data.highlights ?? []), ...childHighlights];
      data.highlightCount = data.highlights.length;

      // Fold child highlight texts into the aggregated string for templates
      // that still read {{note}} / highlightsText.
      const childTexts = childHighlights
        .map((h) => h.text)
        .filter((text) => text.trim().length > 0);
      if (childTexts.length > 0) {
        const existing = data.highlightsText ? [data.highlightsText] : [];
        data.highlightsText = [...existing, ...childTexts].join('\n\n---\n\n');
      }
    }

    entries.push(data);
  }

  for (const orphan of orphans) {
    entries.push(toEntryDataFromReader(orphan));
  }

  return { entries, orphanCount: orphans.length };
}

/**
 * Apply per-database import filters to normalized Readwise entries.
 *
 * Pure function: an absent `filters` argument or an empty dimension passes
 * everything through. `minHighlights` applies only to highlight-mode entries
 * (Reader documents have no nested highlight count); `readerLocations` applies
 * only to Reader documents.
 */
export function applyReadwiseFilters(
  entries: ReadwiseEntryData[],
  filters?: ReadwiseFilters,
): ReadwiseEntryData[] {
  if (!filters) return entries;
  const { categories, tags, minHighlights, readerLocations } = filters;

  return entries.filter((entry) => {
    if (
      categories &&
      categories.length > 0 &&
      !categories.includes(entry.category)
    ) {
      return false;
    }

    if (tags && tags.length > 0 && !entry.tags.some((t) => tags.includes(t))) {
      return false;
    }

    if (
      typeof minHighlights === 'number' &&
      entry.mode === 'readwise-highlights' &&
      entry.highlightCount < minHighlights
    ) {
      return false;
    }

    if (
      readerLocations &&
      readerLocations.length > 0 &&
      entry.mode === 'reader-documents' &&
      !(
        entry.readerLocation != null &&
        readerLocations.includes(entry.readerLocation)
      )
    ) {
      return false;
    }

    return true;
  });
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
  private pollingTimer: number | null = null;
  /** Cancels the in-flight fetch on a new load() or on dispose(). */
  private abortController: AbortController | null = null;

  constructor(
    public readonly id: string,
    private client: ReadwiseApiClient,
    private loadWorker: WorkerManager,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    private syncIntervalMs?: number,
    private filters?: ReadwiseFilters,
  ) {}

  /**
   * Fetch entries from the Readwise API, serialize them, and process
   * through the worker pipeline (same flow as LocalFileSource).
   *
   * When a cache file is configured, API results are persisted to disk.
   * If the API is unreachable, the cache is used as a fallback.
   */
  async load(): Promise<DataSourceLoadResult> {
    // Cancel any previous in-flight fetch and start a fresh cancellation scope.
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const { entries: entryDataArray, errors: fetchErrors } =
        await this.fetchEntryData(signal);

      // Total fetch failure (every API errored and nothing was returned): fall
      // back to the cache instead of caching an empty result, which would clobber
      // previously-good data on a transient outage.
      if (entryDataArray.length === 0 && fetchErrors.length > 0) {
        const cached = await this.readCache();
        if (cached) {
          console.warn('ReadwiseSource: API unavailable, using cached data');
          return await this.processRaw(cached, [
            {
              message: `Readwise API unavailable (using cache): ${fetchErrors[0].message}`,
            },
          ]);
        }
        // No cache to fall back to — surface the API errors without overwriting
        // the cache.
        return await this.processRaw(JSON.stringify([]), fetchErrors);
      }

      const raw = JSON.stringify(entryDataArray);

      // Persist to cache for offline/fast startup
      await this.writeCache(raw);

      return await this.processRaw(raw, fetchErrors);
    } catch (error) {
      // Unexpected processing failure (e.g. worker error) — last-resort cache.
      const cached = await this.readCache();
      if (cached) {
        console.warn('ReadwiseSource: load failed, using cached data');
        return await this.processRaw(cached, [
          {
            message: `Readwise load failed (using cache): ${
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
    } finally {
      // Release the controller only if it is still the one we created here
      // (a newer load() may have replaced it).
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
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
  private async fetchEntryData(signal?: AbortSignal): Promise<{
    entries: ReadwiseEntryData[];
    errors: ParseErrorInfo[];
  }> {
    const [booksResult, docsResult] = await Promise.allSettled([
      this.client.fetchExportBooks({ signal }),
      this.client.fetchReaderDocuments({ signal }),
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
      // Merge Reader child documents (highlights/notes) into their parents
      // instead of dropping them.
      const { entries: merged, orphanCount } = mergeReaderChildren(
        docsResult.value,
      );
      if (orphanCount > 0) {
        console.warn(
          `ReadwiseSource: ${orphanCount} child document(s) had no parent in result set; kept as top-level`,
        );
      }
      entries.push(...merged);
    } else {
      const msg =
        docsResult.reason instanceof Error
          ? docsResult.reason.message
          : String(docsResult.reason);
      errors.push({ message: `Readwise Reader v3 API error: ${msg}` });
    }

    return { entries: applyReadwiseFilters(entries, this.filters), errors };
  }

  /**
   * Start periodic polling for Readwise data changes.
   * The callback triggers a library reload, same as file-watcher sources.
   */
  watch(callback: () => void): void {
    if (this.pollingTimer || !this.syncIntervalMs) return;

    console.debug(
      `ReadwiseSource: Starting periodic sync every ${Math.round(this.syncIntervalMs / 60_000)} min`,
    );
    this.pollingTimer = window.setInterval(() => {
      console.debug('ReadwiseSource: Periodic sync triggered');
      callback();
    }, this.syncIntervalMs);
  }

  /** Stop the polling timer and cancel any in-flight fetch. */
  dispose(): void {
    if (this.pollingTimer) {
      window.clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }
}
