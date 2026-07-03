/**
 * Pure merge logic for incremental Readwise sync.
 *
 * The Readwise APIs support an `updatedAfter` cursor, but the returned delta
 * is NOT a self-contained snapshot:
 *
 * - v2 Export returns books containing ONLY the highlights updated after the
 *   cursor — replacing a cached book wholesale would silently drop its older
 *   highlights, so highlight lists are merged per-item by highlight id.
 * - v3 Reader returns full documents, but child documents (highlights/notes)
 *   may arrive without their parent when only the child changed — those are
 *   folded into the cached parent's highlight list.
 *
 * Deletions are invisible to `updatedAfter` queries. They are only picked up
 * by a full re-fetch (manual "Refresh citation database" → fullRefresh).
 */
import type { ReadwiseReaderDocument } from './readwise-api-client';
import {
  READWISE_MODES,
  type ReadwiseEntryData,
  type ReadwiseHighlightItem,
} from '../adapters/readwise-adapter';

/** Separator used when aggregating highlight texts into a single string. */
const HIGHLIGHT_TEXT_SEPARATOR = '\n\n---\n\n';

/** Whether a structured highlight carries any meaningful content. */
export function isMeaningfulHighlight(item: ReadwiseHighlightItem): boolean {
  return item.text.trim().length > 0 || (item.note ?? '').trim().length > 0;
}

/**
 * Reduce an HTML fragment to plain text: strip tags, decode the handful of
 * entities Reader emits, collapse whitespace. Deliberately regex-based — this
 * runs inside the parse worker, where no DOM is available.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convert a Reader child document (highlight/note) into a highlight item. */
export function readerChildToItem(
  child: ReadwiseReaderDocument,
): ReadwiseHighlightItem {
  // The highlighted text normally arrives in `content`; be tolerant of
  // responses that only carry an HTML variant (`html_content` is the
  // documented withHtmlContent field) so the highlight is kept, not dropped.
  const html = child.html_content ?? child.html;
  const text = child.content ?? (html ? htmlToPlainText(html) : '');
  return {
    id: child.id,
    text,
    note: child.notes || null,
    location: null,
    locationType: null,
    color: null,
    highlightedAt: child.created_at ?? null,
    url: child.source_url || child.url || null,
    tags: Object.keys(child.tags ?? {}),
  };
}

/**
 * Convert a Reader v3 document into the normalized entry data shape.
 * Shared by ReadwiseSource (full fetch) and the delta merge (orphan
 * fallback), so both paths produce identical entries.
 */
export function toEntryDataFromReader(
  doc: ReadwiseReaderDocument,
): ReadwiseEntryData {
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

/** Stable identity of a normalized Readwise entry across syncs. */
function entryKey(entry: ReadwiseEntryData): string {
  return `${entry.mode}:${entry.rawId}`;
}

/** Rebuild the aggregated highlights text from structured items. */
function aggregateHighlightsText(
  items: ReadwiseHighlightItem[],
): string | null {
  const texts = items
    .map((h) => h.text)
    .filter((text) => text.trim().length > 0);
  return texts.length > 0 ? texts.join(HIGHLIGHT_TEXT_SEPARATOR) : null;
}

/**
 * Merge a highlight-mode delta entry into its cached base entry.
 *
 * Metadata comes from the delta (it is newer); highlight items are merged by
 * id with delta items winning, because the v2 Export delta carries only the
 * highlights that changed — the rest live solely in the base entry.
 */
function mergeHighlightEntry(
  base: ReadwiseEntryData,
  delta: ReadwiseEntryData,
): ReadwiseEntryData {
  const items = new Map<string, ReadwiseHighlightItem>();
  for (const item of base.highlights ?? []) items.set(item.id, item);
  for (const item of delta.highlights ?? []) items.set(item.id, item);
  const highlights = [...items.values()];

  return {
    ...delta,
    highlights,
    highlightCount: highlights.length,
    highlightsText: aggregateHighlightsText(highlights),
  };
}

/**
 * Fold a Reader child document into its (cached) parent entry: append the
 * child as a highlight item (replacing a previous item with the same id) and
 * refresh the aggregated text.
 */
function foldChildIntoParent(
  parent: ReadwiseEntryData,
  child: ReadwiseReaderDocument,
): ReadwiseEntryData {
  const item = readerChildToItem(child);
  if (!isMeaningfulHighlight(item)) return parent;

  const items = new Map<string, ReadwiseHighlightItem>();
  for (const existing of parent.highlights ?? [])
    items.set(existing.id, existing);
  items.set(item.id, item);
  const highlights = [...items.values()];

  return {
    ...parent,
    highlights,
    highlightCount: highlights.length,
    highlightsText: aggregateHighlightsText(highlights),
  };
}

/** Input to {@link mergeReadwiseDelta}. */
export interface ReadwiseDeltaInput {
  /** Normalized top-level entries returned by the delta fetch. */
  entries: ReadwiseEntryData[];
  /**
   * Reader child documents whose parent was not part of the delta fetch
   * (the parent itself did not change). Folded into cached parents.
   */
  orphanChildren: ReadwiseReaderDocument[];
}

/**
 * Merge an incremental fetch into the cached full entry set.
 *
 * Pure and idempotent: re-applying the same delta yields the same result,
 * so a failed cache write (which keeps the old `lastSyncAt` cursor) is safe —
 * the next sync simply re-merges the same delta.
 */
export function mergeReadwiseDelta(
  base: ReadwiseEntryData[],
  delta: ReadwiseDeltaInput,
): ReadwiseEntryData[] {
  if (delta.entries.length === 0 && delta.orphanChildren.length === 0) {
    return base;
  }

  const merged = new Map<string, ReadwiseEntryData>();
  for (const entry of base) merged.set(entryKey(entry), entry);

  for (const entry of delta.entries) {
    const key = entryKey(entry);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
    } else if (entry.mode === READWISE_MODES.Highlights) {
      merged.set(key, mergeHighlightEntry(existing, entry));
    } else {
      // Reader documents come back whole — the delta entry replaces the
      // cached one (its own children were already folded in by the source).
      merged.set(key, entry);
    }
  }

  for (const child of delta.orphanChildren) {
    if (child.parent_id == null) continue;
    const parentKey = `${READWISE_MODES.Reader}:${child.parent_id}`;
    const parent = merged.get(parentKey);
    if (parent) {
      merged.set(parentKey, foldChildIntoParent(parent, child));
    } else {
      // True orphan even against the cache: keep it as a standalone entry so
      // no user data is silently lost (mirrors the full-fetch behavior).
      console.warn(
        `Readwise delta: child document ${child.id} has no parent in cache; keeping standalone`,
      );
      const standalone = toEntryDataFromReader(child);
      merged.set(entryKey(standalone), standalone);
    }
  }

  return [...merged.values()];
}
