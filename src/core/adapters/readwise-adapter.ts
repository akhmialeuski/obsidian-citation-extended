import { Author, Entry } from '../types/entry';
import type { Annotation } from '../types/annotation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named constants for the Readwise API modes (avoids scattered string literals). */
export const READWISE_MODES = {
  Highlights: 'readwise-highlights',
  Reader: 'reader-documents',
} as const;

/** Mode indicating which Readwise API endpoint the data came from. */
export type ReadwiseMode = (typeof READWISE_MODES)[keyof typeof READWISE_MODES];

/**
 * A single structured highlight/annotation belonging to a Readwise entry.
 * Exposes per-highlight metadata (note, location, color, tags) that the
 * aggregated {@link ReadwiseEntryData.highlightsText} string discards.
 */
export interface ReadwiseHighlightItem {
  /** Stable highlight id (v2 highlight id, or Reader child document id). */
  id: string;
  /** The highlighted text. */
  text: string;
  /** Personal note attached to the highlight, or `null`. */
  note: string | null;
  /** Location locator (page / order / percent), or `null`. */
  location: number | null;
  /** Location type: "page" | "order" | "time_offset" | "none", or `null`. */
  locationType: string | null;
  /** Highlight color, or `null`. */
  color: string | null;
  /** ISO 8601 timestamp when the highlight was made, or `null`. */
  highlightedAt: string | null;
  /** Direct URL to the highlight, or `null`. */
  url: string | null;
  /** Per-highlight tags. */
  tags: string[];
}

/** Normalized internal data shape for entries originating from Readwise. */
export interface ReadwiseEntryData {
  /** Source API mode. */
  mode: ReadwiseMode;
  /** Raw ID from the API (user_book_id for v2, document id for v3). */
  rawId: string;
  title: string;
  author: string;
  category: string;
  sourceUrl: string | null;
  readwiseUrl: string;
  coverImageUrl: string | null;
  summary: string | null;
  /** Aggregated highlight texts, joined by newlines (legacy/backward-compat). */
  highlightsText: string | null;
  /**
   * Structured highlights with per-item metadata. Optional for backward-compat
   * with cached JSON written before this field existed.
   */
  highlights?: ReadwiseHighlightItem[];
  highlightCount: number;
  tags: string[];
  publishedDate: string | null;
  updatedAt: string | null;
  // --- Additional mapped fields (optional for backward-compat with cached
  //     JSON written before these fields existed) ---------------------------
  /** Cleaned/normalized title (v2 `readable_title`) → titleShort. */
  readableTitle?: string | null;
  /** Origin: "kindle"/"instapaper" (v2) or Reader source (v3) → source. */
  source?: string | null;
  /** Amazon ASIN (v2 Export books only) → `asin` getter (deliberately not ISBN). */
  asin?: string | null;
  /** Document-level note (v2 `document_note` / v3 `notes`). */
  documentNote?: string | null;
  /** Source site name (v3 `site_name`) → containerTitle. */
  siteName?: string | null;
  /** Word count (v3 only). */
  wordCount?: number | null;
  /** Reading progress 0..1 (v3 only). */
  readingProgress?: number | null;
  /** Reader location: new/later/shortlist/archive/feed (v3 only). */
  readerLocation?: string | null;
  /** Extra raw fields the adapter does not map but preserves in toJSON. */
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Readwise / Reader category strings to standard reference types. */
const CATEGORY_TYPE_MAP: Record<string, string> = {
  books: 'book',
  articles: 'article',
  tweets: 'webpage',
  podcasts: 'speech',
  supplementals: 'document',
  email: 'letter',
  pdf: 'document',
  epub: 'book',
  rss: 'article',
  video: 'motion_picture',
  highlight: 'entry',
  note: 'entry',
  article: 'article',
};

function mapCategoryToType(category: string): string {
  return CATEGORY_TYPE_MAP[category] ?? 'document';
}

/**
 * Parse a human-readable author string into structured {@link Author} objects.
 *
 * Splits on " and " first, then on ", " to handle comma-separated lists
 * and the common "Author A and Author B" pattern.
 */
function parseAuthors(authorStr: string): Author[] {
  if (!authorStr || !authorStr.trim()) return [];

  const parts = authorStr.split(/\s+and\s+/).flatMap((p) => p.split(/,\s*/));

  return parts
    .filter((p) => p.trim().length > 0)
    .map((name) => {
      const trimmed = name.trim();
      const words = trimmed.split(/\s+/);
      if (words.length === 1) {
        return { literal: trimmed };
      }
      return {
        given: words.slice(0, -1).join(' '),
        family: words[words.length - 1],
      };
    });
}

/**
 * Parse an ISO 8601 date string into a Date object.
 * Returns `null` when the input is falsy or unparseable.
 */
function toDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const ms = Date.parse(dateStr);
  if (isNaN(ms)) return null;
  return new Date(ms);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Adapter that maps Readwise-specific data to the standard {@link Entry}
 * interface.  Works for both Readwise v2 Export entries (highlights) and
 * Reader v3 entries (documents).
 *
 * Follows the same structural pattern as {@link HayagrivaAdapter}.
 */
export class ReadwiseAdapter extends Entry {
  private data: ReadwiseEntryData;

  eprint: string | null = null;
  eprinttype: string | null = null;
  files: string[] | null = null;

  _sourceDatabase?: string;
  _compositeCitekey?: string;
  private _id?: string;

  constructor(data: ReadwiseEntryData) {
    super();
    this.data = data;

    // Populate the inherited _note array so the base-class `note` getter
    // returns aggregated highlight text.
    if (data.highlightsText) {
      this._note = [data.highlightsText];
    }
  }

  // -- Identity -------------------------------------------------------------

  get id(): string {
    return this._id ?? this.citekey;
  }

  set id(value: string) {
    this._id = value;
  }

  get citekey(): string {
    return this.data.mode === READWISE_MODES.Highlights
      ? `rw-${this.data.rawId}`
      : `rd-${this.data.rawId}`;
  }

  // -- Standard Entry fields ------------------------------------------------

  get type(): string {
    return mapCategoryToType(this.data.category);
  }

  get abstract(): string | undefined {
    return this.data.summary ?? undefined;
  }

  /** Memoized structured authors — string parsing runs at most once. */
  get author(): Author[] | undefined {
    return this.memo('author', () => {
      const authors = parseAuthors(this.data.author);
      return authors.length > 0 ? authors : undefined;
    });
  }

  get authorString(): string | null {
    return this.data.author || null;
  }

  get containerTitle(): string | undefined {
    return this.data.siteName ?? undefined;
  }

  get DOI(): string | undefined {
    return undefined;
  }

  get ISBN(): string | undefined {
    // ASIN is an Amazon identifier, not an ISBN (for non-book Kindle items it
    // is a "B0..." code). Exposing it as ISBN would put invalid values into
    // citation styles, so keep ISBN empty and surface ASIN via its own getter.
    return undefined;
  }

  /** Memoized issued date — Date parsing runs at most once per entry. */
  get issuedDate(): Date | null {
    return this.memo('issuedDate', () => toDate(this.data.publishedDate));
  }

  get page(): string | undefined {
    return undefined;
  }

  get title(): string | undefined {
    return this.data.title || undefined;
  }

  get titleShort(): string | undefined {
    return this.data.readableTitle ?? undefined;
  }

  get URL(): string | undefined {
    return this.data.sourceUrl ?? undefined;
  }

  get publisher(): string | undefined {
    return undefined;
  }

  get publisherPlace(): string | undefined {
    return undefined;
  }

  get eventPlace(): string | undefined {
    return undefined;
  }

  get language(): string | undefined {
    return undefined;
  }

  get source(): string | undefined {
    return this.data.source ?? undefined;
  }

  get zoteroId(): string | undefined {
    return undefined;
  }

  get keywords(): string[] | undefined {
    return this.data.tags.length > 0 ? this.data.tags : undefined;
  }

  get series(): string | undefined {
    return undefined;
  }

  get volume(): string | undefined {
    return undefined;
  }

  // -- Overridden base-class getters ----------------------------------------

  /** Returns the Readwise web URL instead of a zotero:// select URI. */
  public override get zoteroSelectURI(): string {
    return this.data.readwiseUrl;
  }

  // -- Readwise-specific getters --------------------------------------------

  /** URL to the entry on the Readwise web app. */
  get readwiseUrl(): string {
    return this.data.readwiseUrl;
  }

  /** Cover image URL, or `null` when unavailable. */
  get coverImageUrl(): string | null {
    return this.data.coverImageUrl;
  }

  /** Number of highlights associated with this entry. */
  get highlightCount(): number {
    return this.data.highlightCount;
  }

  /** Original Readwise / Reader category string. */
  get category(): string {
    return this.data.category;
  }

  /**
   * Amazon ASIN for Kindle books (v2 Export books only), or `undefined`.
   * Kept separate from {@link ISBN} because an ASIN is not a valid ISBN.
   */
  get asin(): string | undefined {
    return this.data.asin ?? undefined;
  }

  /** Document-level note (distinct from individual highlights), or `null`. */
  get documentNote(): string | null {
    return this.data.documentNote ?? null;
  }

  /** Reader word count, or `null` when unavailable. */
  get wordCount(): number | null {
    return this.data.wordCount ?? null;
  }

  /** Reader reading progress in the range 0..1, or `null` when unavailable. */
  get readingProgress(): number | null {
    return this.data.readingProgress ?? null;
  }

  /** Reader location (new/later/shortlist/archive/feed), or `null`. */
  get readerLocation(): string | null {
    return this.data.readerLocation ?? null;
  }

  /**
   * Readwise highlights ARE annotations — exposed ONLY through the
   * source-agnostic {@link Entry.annotations} interface (the same one Zotero
   * maps into), so `{{annotations}}` works uniformly across sources and there
   * is no second, Readwise-specific template surface for the same data.
   * Derived from the parsed entry data (no external fetch), memoized because
   * sort/search touch it.
   */
  get annotations(): Annotation[] {
    return this.memo('annotations', () =>
      (this.data.highlights ?? []).map((h, index) =>
        readwiseHighlightToAnnotation(h, index),
      ),
    );
  }
}

/** Zero-pad an index so lexicographic sort equals highlight order. */
function orderKey(index: number): string {
  return String(index).padStart(8, '0');
}

/** Map one Readwise highlight into the source-agnostic annotation shape. */
function readwiseHighlightToAnnotation(
  h: ReadwiseHighlightItem,
  index: number,
): Annotation {
  const isPage = h.locationType === 'page' && h.location != null;
  return {
    id: h.id || null,
    type: 'highlight',
    text: h.text ?? '',
    comment: h.note ?? '',
    // Readwise stores a palette NAME (e.g. "yellow"), not a hex value.
    color: '',
    colorName: h.color ?? null,
    page: isPage ? h.location : null,
    pageLabel: isPage ? String(h.location) : '',
    tags: h.tags ?? [],
    imagePath: null,
    openURI: h.url ?? null,
    sortIndex: orderKey(index),
    dateModified: h.highlightedAt ?? null,
    source: 'readwise',
  };
}
