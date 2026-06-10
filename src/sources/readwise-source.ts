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
  READWISE_MODES,
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
  // Defensive: the API types declare these arrays non-null, but the raw
  // response is not validated per-field, so guard against null/absent.
  const rawHighlights = book.highlights ?? [];

  // Structured highlights preserve per-item metadata (note/location/color/tags).
  const highlights = rawHighlights
    .map(exportHighlightToItem)
    .filter(isMeaningfulHighlight);

  // Aggregated string kept for backward-compat with {{note}} templates.
  // Guard against highlights missing `text` and drop blank entries so the
  // aggregated string never contains stray `undefined`/empty segments.
  const highlightTexts = rawHighlights
    .map((h) => h.text ?? '')
    .filter((text) => text.trim().length > 0);
  const highlightsText =
    highlightTexts.length > 0 ? highlightTexts.join('\n\n---\n\n') : null;

  // Find the latest highlight update timestamp
  const updatedAt =
    rawHighlights.length > 0
      ? rawHighlights.reduce(
          (latest, h) => (h.updated > latest ? h.updated : latest),
          rawHighlights[0].updated,
        )
      : null;

  return {
    mode: READWISE_MODES.Highlights,
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
    tags: (book.book_tags ?? []).map((t) => t.name),
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
    mode: READWISE_MODES.Reader,
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
    // Guard against a null/absent tags map (the API type is non-null but the
    // raw response is not validated per-field), mirroring readerChildToItem.
    tags: Object.keys(doc.tags ?? {}),
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
  // Treat both null and an absent/undefined parent_id as a top-level document
  // (loose `== null`), so a document with no parent is never misclassified as
  // an orphan child.
  const parents = docs.filter((doc) => doc.parent_id == null);
  const parentIds = new Set(parents.map((doc) => doc.id));

  const childrenByParent = new Map<string, ReadwiseReaderDocument[]>();
  const orphans: ReadwiseReaderDocument[] = [];

  for (const doc of docs) {
    if (doc.parent_id == null) continue;
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

  // Category and Reader-location values are a fixed vocabulary the Readwise API
  // returns lowercase, so match them case-insensitively — otherwise a user
  // typing "Books"/"Later" would silently match nothing. Tags are user-defined,
  // so they stay case-sensitive.
  const categorySet =
    categories && categories.length > 0
      ? new Set(categories.map((c) => c.toLowerCase()))
      : null;
  const locationSet =
    readerLocations && readerLocations.length > 0
      ? new Set(readerLocations.map((l) => l.toLowerCase()))
      : null;

  return entries.filter((entry) => {
    // `category` is non-optional in the type but copied from an unvalidated API
    // response, so guard the dereference (a null category must not crash load).
    if (categorySet && !categorySet.has((entry.category ?? '').toLowerCase())) {
      return false;
    }

    // Guard the `tags` dereference for the same reason as `category` above: a
    // corrupt/legacy cache entry (read via parseCachedEntries, which does not
    // validate per-field) may lack the array even though the type is non-null.
    if (
      tags &&
      tags.length > 0 &&
      !(entry.tags ?? []).some((t) => tags.includes(t))
    ) {
      return false;
    }

    if (
      typeof minHighlights === 'number' &&
      entry.mode === READWISE_MODES.Highlights &&
      entry.highlightCount < minHighlights
    ) {
      return false;
    }

    if (
      locationSet &&
      entry.mode === READWISE_MODES.Reader &&
      !(
        entry.readerLocation != null &&
        locationSet.has(entry.readerLocation.toLowerCase())
      )
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Marker error for a deliberate total-outage-with-no-cache failure, so the
 * load() catch can surface it directly without re-probing the cache.
 */
class ReadwiseOutageError extends Error {}

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
  async load(externalSignal?: AbortSignal): Promise<DataSourceLoadResult> {
    // Cancel any previous in-flight fetch and start a fresh cancellation scope.
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const signal = controller.signal;
    // If the library load is aborted (load timeout, dispose, or a newer load),
    // cancel ours too so in-flight HTTP work and rate-limit back-offs stop
    // instead of leaking and burning the Readwise rate-limit budget. Honour an
    // already-aborted signal too (addEventListener would never fire for it).
    if (externalSignal?.aborted) {
      controller.abort();
    } else {
      externalSignal?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    try {
      const {
        entries: entryDataArray,
        errors: fetchErrors,
        allFailed,
      } = await this.fetchEntryData(signal);

      // Total outage (every API endpoint failed): fall back to the cache if
      // present; otherwise THROW so the library surfaces a real failure and
      // keeps the prior in-memory library / last-sync date, instead of
      // reporting a misleading empty "success with warnings". A partial failure
      // (one endpoint down, the other returning data or a legitimate empty set)
      // is NOT treated as an outage.
      if (allFailed) {
        const cachedEntries = await this.readCachedEntries();
        if (cachedEntries) {
          console.warn('ReadwiseSource: API unavailable, using cached data');
          return await this.runPipeline(
            cachedEntries,
            [
              {
                message: `Readwise API unavailable (using cache): ${fetchErrors[0].message}`,
              },
            ],
            signal,
          );
        }
        throw new ReadwiseOutageError(
          fetchErrors.map((e) => e.message).join('; '),
        );
      }

      // Persist the UNFILTERED entries (only on a fully-clean fetch), so the
      // cache is a full-fidelity backup and later filter changes still apply on
      // read; a partial outage never clobbers a previously-complete snapshot.
      if (fetchErrors.length === 0) {
        await this.writeCache(JSON.stringify(entryDataArray));
      }

      return await this.runPipeline(entryDataArray, fetchErrors, signal);
    } catch (error) {
      // Deliberate total-outage failure: surface it without re-probing the
      // cache (the outage branch already consulted it).
      if (error instanceof ReadwiseOutageError) {
        console.error(
          `ReadwiseSource: Readwise API unavailable: ${error.message}`,
        );
        throw new Error(`Failed to load from Readwise API: ${error.message}`);
      }

      // Unexpected processing failure (e.g. worker error) — last-resort cache.
      const cachedEntries = await this.readCachedEntries();
      if (cachedEntries) {
        console.warn('ReadwiseSource: load failed, using cached data');
        return await this.runPipeline(
          cachedEntries,
          [
            {
              message: `Readwise load failed (using cache): ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          signal,
        );
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
   * Apply the configured import filters to normalized entries, then run them
   * through the worker pipeline. Filtering happens here (not at fetch or cache
   * time) so the offline cache stays full-fidelity and the current filters are
   * always honoured — including on the cache-fallback path.
   */
  private async runPipeline(
    entries: ReadwiseEntryData[],
    fetchErrors: ParseErrorInfo[],
    signal?: AbortSignal,
  ): Promise<DataSourceLoadResult> {
    const filtered = applyReadwiseFilters(entries, this.filters);
    return this.processRaw(JSON.stringify(filtered), fetchErrors, signal);
  }

  /**
   * Read and parse the cache file. Returns `null` when the cache is missing
   * OR corrupt (unparseable / not an array) — a corrupt cache must behave
   * exactly like no cache, so an outage still surfaces as a failure instead
   * of silently replacing the library with an empty "success". A legitimately
   * cached empty array (`[]`) is still a valid fallback.
   */
  private async readCachedEntries(): Promise<ReadwiseEntryData[] | null> {
    const raw = await this.readCache();
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ReadwiseEntryData[]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Run serialized ReadwiseEntryData JSON through the worker pipeline.
   */
  private async processRaw(
    raw: string,
    fetchErrors: ParseErrorInfo[],
    signal?: AbortSignal,
  ): Promise<DataSourceLoadResult> {
    const result = await this.loadWorker.post(
      {
        databaseRaw: raw,
        databaseType: DATABASE_FORMATS.Readwise,
      },
      signal,
    );

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
    /** True only when EVERY API call failed (a real total outage). */
    allFailed: boolean;
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

    // A total outage = every endpoint rejected. A single endpoint failing while
    // the other returns (even empty) is a partial failure, not a total one.
    const allFailed =
      booksResult.status === 'rejected' && docsResult.status === 'rejected';

    // Return UNFILTERED entries; filters are applied at read time (runPipeline)
    // so the offline cache stays full-fidelity and current filters always apply.
    return { entries, errors, allFailed };
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
