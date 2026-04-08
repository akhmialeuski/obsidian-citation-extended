import { Author, Entry } from '../types/entry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mode indicating which Readwise API endpoint the data came from. */
export type ReadwiseMode = 'readwise-highlights' | 'reader-documents';

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
  /** Aggregated highlight texts, joined by newlines. */
  highlightsText: string | null;
  highlightCount: number;
  tags: string[];
  publishedDate: string | null;
  updatedAt: string | null;
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
    return this.data.mode === 'readwise-highlights'
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

  get author(): Author[] | undefined {
    const authors = parseAuthors(this.data.author);
    return authors.length > 0 ? authors : undefined;
  }

  get authorString(): string | null {
    return this.data.author || null;
  }

  get containerTitle(): string | undefined {
    return undefined;
  }

  get DOI(): string | undefined {
    return undefined;
  }

  get ISBN(): string | undefined {
    return undefined;
  }

  get issuedDate(): Date | null {
    return toDate(this.data.publishedDate);
  }

  get page(): string | undefined {
    return undefined;
  }

  get title(): string | undefined {
    return this.data.title || undefined;
  }

  get titleShort(): string | undefined {
    return undefined;
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
    return undefined;
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
}
