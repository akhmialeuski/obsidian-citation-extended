import {
  DataSource,
  DataSourceLoadOptions,
  DataSourceLoadResult,
} from '../data-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseHighlight,
  ReadwiseReaderDocument,
} from '../core/readwise/readwise-api-client';
import {
  isMeaningfulHighlight,
  mergeReadwiseDelta,
  readerChildToItem,
  toEntryDataFromReader,
} from '../core/readwise/readwise-delta';
import {
  ReadwiseEntryData,
  ReadwiseHighlightItem,
  READWISE_MODES,
} from '../core/adapters/readwise-adapter';
import { DATABASE_FORMATS, WORKER_TASK_KINDS, convertToEntries } from '../core';
import type { ParseErrorInfo, ReadwiseFilters } from '../core';
import type { IFileSystem } from '../platform/platform-adapter';
import { WorkerManager } from '../util';
import { createLinkedAbortController, PeriodicSync } from './source-utils';

// Conversion helpers

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

/** Result of merging Reader child documents into their parents. */
interface MergedReaderResult {
  entries: ReadwiseEntryData[];
  /**
   * Child documents whose parent was not in the fetched set. On a full fetch
   * these become standalone entries; on an incremental fetch they are folded
   * into their cached parents by {@link mergeReadwiseDelta}.
   */
  orphanChildren: ReadwiseReaderDocument[];
}

/**
 * Merge Reader v3 child documents (highlights/notes, identified by a non-null
 * `parent_id`) into their parent document's structured highlights, instead of
 * dropping them. Children whose parent is absent from the fetched set are
 * returned separately so the caller can decide how to handle them.
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
  const orphanChildren: ReadwiseReaderDocument[] = [];

  for (const doc of docs) {
    if (doc.parent_id == null) continue;
    if (parentIds.has(doc.parent_id)) {
      const siblings = childrenByParent.get(doc.parent_id) ?? [];
      siblings.push(doc);
      childrenByParent.set(doc.parent_id, siblings);
    } else {
      orphanChildren.push(doc);
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

  return { entries, orphanChildren };
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
    // corrupt/legacy cache entry (read via readCachedState, which does not
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

// Cache state

/**
 * Versioned on-disk cache payload. Legacy caches (written before incremental
 * sync) are a bare `ReadwiseEntryData[]` array; they are readable as a
 * fallback base but carry no cursor, so the first sync after upgrading is a
 * full fetch that rewrites the cache in this format.
 */
interface ReadwiseCacheStateV1 {
  version: 1;
  /**
   * ISO timestamp captured at the START of the last fully-clean fetch; used
   * as the next `updatedAfter` cursor. Capturing before the fetch (not after)
   * means updates racing the fetch window are re-delivered next time instead
   * of being missed — the merge is idempotent, so re-delivery is safe.
   */
  lastSyncAt: string | null;
  entries: ReadwiseEntryData[];
}

/** Parsed cache content: entries + cursor, or nulls when missing/corrupt. */
interface CachedState {
  entries: ReadwiseEntryData[] | null;
  lastSyncAt: string | null;
}

const EMPTY_CACHED_STATE: CachedState = { entries: null, lastSyncAt: null };

/**
 * Safety overlap subtracted from the stored cursor when it is USED as
 * `updatedAfter`. The cursor is captured from the local clock, while Readwise
 * compares it against server-side `updated_at` timestamps — a client clock
 * running ahead of the server would otherwise create a silent blind window of
 * missed updates every sync. Over-fetching is free: the delta merge is
 * idempotent, so re-delivered entries are simply re-merged.
 */
const CURSOR_OVERLAP_MS = 5 * 60_000;

/**
 * Apply the clock-skew overlap to a stored cursor. Returns `null` when the
 * cursor is unparseable (corrupt cache) — the caller then falls back to a
 * full fetch, exactly as if no cursor existed.
 */
function overlappedCursor(lastSyncAt: string): string | null {
  const timestamp = Date.parse(lastSyncAt);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp - CURSOR_OVERLAP_MS).toISOString();
}

// DataSource implementation

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
 * **Incremental sync:** when the offline cache holds a `lastSyncAt` cursor,
 * only entries updated after it are fetched (`updatedAfter`) and merged into
 * the cached full set — instead of re-downloading the entire library on every
 * periodic poll. Deletions are invisible to `updatedAfter`; the manual
 * "Refresh citation database" command passes `fullRefresh` to recover.
 */
export class ReadwiseSource implements DataSource {
  /** Cancels the in-flight fetch on a new load() or on dispose(). */
  private abortController: AbortController | null = null;
  private readonly poller: PeriodicSync | null;

  constructor(
    public readonly id: string,
    private client: ReadwiseApiClient,
    private loadWorker: WorkerManager,
    private fileSystem?: IFileSystem,
    private cachePath?: string,
    /**
     * Returns the current periodic-sync interval in ms (0 = disabled). A
     * provider rather than a snapshot, so settings changes take effect on the
     * next poll cycle without recreating the source (which would reset the
     * timer and drop incremental-sync continuity).
     */
    syncIntervalProvider?: () => number,
    private filters?: ReadwiseFilters,
    /**
     * Pre-upgrade cache path (keyed by the old volatile source key). Read as a
     * fallback so an existing install's offline cache is not orphaned when the
     * cache filename scheme changes to the stable database id.
     */
    private legacyCachePath?: string,
  ) {
    this.poller = syncIntervalProvider
      ? new PeriodicSync(syncIntervalProvider, 'ReadwiseSource')
      : null;
  }

  /**
   * Fetch entries from the Readwise API, serialize them, and process
   * through the worker pipeline (same flow as LocalFileSource).
   *
   * When a cache file is configured, API results are persisted to disk.
   * If the API is unreachable, the cache is used as a fallback.
   */
  async load(
    externalSignal?: AbortSignal,
    options?: DataSourceLoadOptions,
  ): Promise<DataSourceLoadResult> {
    // Cancel any previous in-flight fetch and start a fresh cancellation scope
    // linked to the library load's signal, so in-flight HTTP work and
    // rate-limit back-offs stop when the load is aborted instead of leaking
    // and burning the Readwise rate-limit budget.
    this.abortController?.abort();
    const controller = createLinkedAbortController(externalSignal);
    this.abortController = controller;
    const signal = controller.signal;

    try {
      const cached = await this.readCachedState();
      // Incremental sync requires a cached base to merge into AND a usable
      // cursor (overlapped against clock skew); a fullRefresh request
      // bypasses it deliberately.
      const updatedAfter =
        !options?.fullRefresh &&
        cached.entries !== null &&
        cached.lastSyncAt !== null
          ? overlappedCursor(cached.lastSyncAt)
          : null;
      const incremental = updatedAfter !== null;

      // Cursor for the NEXT sync, captured before this fetch starts.
      const fetchStartedAt = new Date().toISOString();

      const {
        entries: fetchedEntries,
        orphanChildren,
        errors: fetchErrors,
        allFailed,
      } = await this.fetchEntryData(signal, updatedAfter ?? undefined);

      // Promise.allSettled makes an aborted fetch look like a total outage
      // (both endpoints "rejected"). Surface it as a cancellation instead, so
      // a superseded load fails fast rather than running a cache-fallback
      // pipeline whose result the caller will discard anyway.
      if (signal.aborted) {
        throw (signal.reason ?? new Error('Readwise load aborted')) as Error;
      }

      // Total outage (every API endpoint failed): fall back to the cache if
      // present; otherwise THROW so the library surfaces a real failure and
      // keeps the prior in-memory library / last-sync date, instead of
      // reporting a misleading empty "success with warnings". A partial failure
      // (one endpoint down, the other returning data or a legitimate empty set)
      // is NOT treated as an outage.
      if (allFailed) {
        if (cached.entries) {
          console.warn('ReadwiseSource: API unavailable, using cached data');
          return await this.runPipeline(
            cached.entries,
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

      let fullEntries: ReadwiseEntryData[];
      if (incremental) {
        console.debug(
          `ReadwiseSource: incremental sync since ${cached.lastSyncAt!} ` +
            `(${fetchedEntries.length} changed entries)`,
        );
        fullEntries = mergeReadwiseDelta(cached.entries!, {
          entries: fetchedEntries,
          orphanChildren,
        });
      } else {
        // Full fetch: orphan children are kept as standalone top-level
        // entries (logged), so no user data is silently lost.
        if (orphanChildren.length > 0) {
          console.warn(
            `ReadwiseSource: ${orphanChildren.length} child document(s) had no parent in result set; kept as top-level`,
          );
        }
        fullEntries = [
          ...fetchedEntries,
          ...orphanChildren.map(toEntryDataFromReader),
        ];
      }

      // Persist the UNFILTERED merged set (only on a fully-clean fetch), so
      // the cache is a full-fidelity backup and later filter changes still
      // apply on read; a partial outage never clobbers a previously-complete
      // snapshot. The cursor advances ONLY together with the entries it
      // matches — a failed write keeps the old cursor+base pair on disk,
      // and the next sync simply re-merges the same delta (idempotent).
      if (fetchErrors.length === 0) {
        await this.writeCache(
          JSON.stringify({
            version: 1,
            lastSyncAt: fetchStartedAt,
            entries: fullEntries,
          } satisfies ReadwiseCacheStateV1),
        );
      }

      return await this.runPipeline(fullEntries, fetchErrors, signal);
    } catch (error) {
      // A cancelled/superseded load must fail fast: re-probing the cache and
      // re-running the pipeline against an already-aborted signal is wasted
      // work whose result the caller will discard anyway.
      if (signal.aborted) {
        throw error;
      }

      // Deliberate total-outage failure: surface it without re-probing the
      // cache (the outage branch already consulted it).
      if (error instanceof ReadwiseOutageError) {
        console.error(
          `ReadwiseSource: Readwise API unavailable: ${error.message}`,
        );
        throw new Error(`Failed to load from Readwise API: ${error.message}`);
      }

      // Unexpected processing failure (e.g. worker error) — last-resort cache.
      const cached = await this.readCachedState();
      if (cached.entries) {
        console.warn('ReadwiseSource: load failed, using cached data');
        return await this.runPipeline(
          cached.entries,
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
   * Read and parse the cache file. Returns null fields when the cache is
   * missing OR corrupt (unparseable / unexpected shape) — a corrupt cache must
   * behave exactly like no cache, so an outage still surfaces as a failure
   * instead of silently replacing the library with an empty "success". A
   * legitimately cached empty array (`[]`) is still a valid fallback.
   */
  private async readCachedState(): Promise<CachedState> {
    const raw = await this.readCache();
    if (raw === null) return EMPTY_CACHED_STATE;
    try {
      const parsed: unknown = JSON.parse(raw);
      // Legacy format (pre-incremental-sync): bare entry array, no cursor.
      if (Array.isArray(parsed)) {
        return { entries: parsed as ReadwiseEntryData[], lastSyncAt: null };
      }
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed as { version?: unknown }).version === 1 &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ) {
        const v1 = parsed as ReadwiseCacheStateV1;
        return {
          entries: v1.entries,
          lastSyncAt: typeof v1.lastSyncAt === 'string' ? v1.lastSyncAt : null,
        };
      }
      return EMPTY_CACHED_STATE;
    } catch {
      return EMPTY_CACHED_STATE;
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
        kind: WORKER_TASK_KINDS.Parse,
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
    const primary = await this.readCacheFrom(this.cachePath);
    if (primary !== null) return primary;
    // Fall back to the pre-upgrade path so an existing install's cache is not
    // orphaned when the cache-filename scheme changes to the stable database id.
    if (this.legacyCachePath && this.legacyCachePath !== this.cachePath) {
      return this.readCacheFrom(this.legacyCachePath);
    }
    return null;
  }

  private async readCacheFrom(path?: string): Promise<string | null> {
    if (!this.fileSystem || !path) return null;
    try {
      if (await this.fileSystem.exists(path)) {
        return await this.fileSystem.readFile(path);
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
   *
   * @param updatedAfter  Optional ISO cursor — fetch only entries updated
   *                      after it (incremental sync).
   */
  private async fetchEntryData(
    signal?: AbortSignal,
    updatedAfter?: string,
  ): Promise<{
    entries: ReadwiseEntryData[];
    orphanChildren: ReadwiseReaderDocument[];
    errors: ParseErrorInfo[];
    /** True only when EVERY API call failed (a real total outage). */
    allFailed: boolean;
  }> {
    const [booksResult, docsResult] = await Promise.allSettled([
      this.client.fetchExportBooks({ signal, updatedAfter }),
      this.client.fetchReaderDocuments({ signal, updatedAfter }),
    ]);

    const entries: ReadwiseEntryData[] = [];
    let orphanChildren: ReadwiseReaderDocument[] = [];
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
      const merged = mergeReaderChildren(docsResult.value);
      entries.push(...merged.entries);
      orphanChildren = merged.orphanChildren;
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
    return { entries, orphanChildren, errors, allFailed };
  }

  /**
   * Start periodic polling for Readwise data changes. The callback triggers a
   * library reload, same as file-watcher sources. Delegated to
   * {@link PeriodicSync}, which re-reads the interval provider each cycle so an
   * interval change in settings applies without recreating the source.
   */
  watch(callback: () => void): void {
    this.poller?.start(callback);
  }

  /** Stop the polling timer and cancel any in-flight fetch. */
  dispose(): void {
    this.poller?.stop();
    this.abortController?.abort();
    this.abortController = null;
  }
}
