import { Author, Entry } from '../types/entry';

/**
 * Raw shape of a Hayagriva YAML entry after parsing.
 * Hayagriva is a YAML-based bibliography format used by Typst.
 * See: https://github.com/typst/hayagriva
 */
export interface HayagrivaEntryData {
  /** Citekey — injected by the parser from the top-level YAML key. */
  id: string;
  type?: string;
  title?: string;
  author?: (string | { family?: string; given?: string })[];
  editor?: (string | { family?: string; given?: string })[];
  date?: string;
  url?: string;
  doi?: string;
  isbn?: string;
  abstract?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  parent?: {
    type?: string;
    title?: string;
    author?: (string | { family?: string; given?: string })[];
    volume?: string;
    issue?: string;
    publisher?: string;
  };
  language?: string;
  serial?: string;
}

/**
 * Convert a Hayagriva author entry into the standard Author format.
 * Hayagriva authors can be plain strings ("John Doe") or structured objects.
 */
function toAuthor(raw: string | { family?: string; given?: string }): Author {
  if (typeof raw === 'string') {
    const parts = raw.split(/\s+/);
    if (parts.length === 1) {
      return { literal: raw };
    }
    return {
      given: parts.slice(0, -1).join(' '),
      family: parts[parts.length - 1],
    };
  }
  return { given: raw.given, family: raw.family };
}

/**
 * Convert a Hayagriva date string ("2023", "2023-06", "2023-06-15")
 * into a Date object.
 */
function toDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map((p) => parseInt(p));
  if (parts.length === 0 || isNaN(parts[0])) return null;
  const year = parts[0];
  const month = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 1;
  const day = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Adapter that maps Hayagriva-specific fields to the standard Entry
 * interface.  Receives already-parsed data from the Hayagriva YAML
 * parser ({@link parseHayagrivaYaml} in `parsing/hayagriva-parser.ts`).
 */
export class HayagrivaAdapter extends Entry {
  private data: HayagrivaEntryData;

  eprint: string | null = null;
  eprinttype: string | null = null;
  files: string[] | null = null;

  _sourceDatabase?: string;
  _compositeCitekey?: string;
  private _id?: string;

  constructor(data: HayagrivaEntryData) {
    super();
    this.data = data;
  }

  get id(): string {
    return this._id || this.data.id;
  }
  set id(value: string) {
    this._id = value;
  }

  get citekey(): string {
    return this.data.id;
  }

  get type(): string {
    return this.data.type || 'article';
  }

  get abstract(): string | undefined {
    return this.data.abstract;
  }

  /** Memoized structured authors — the per-call map is computed only once. */
  private _authorCache?: Author[] | null;

  get author(): Author[] | undefined {
    if (this._authorCache === undefined) {
      const authors = this.data.author;
      this._authorCache =
        !authors || !Array.isArray(authors) ? null : authors.map(toAuthor);
    }
    return this._authorCache ?? undefined;
  }

  /** Memoized author string — the map+join is computed only once. */
  private _authorStringCache?: string | null;

  get authorString(): string | null {
    if (this._authorStringCache === undefined) {
      const authors = this.author;
      this._authorStringCache = !authors
        ? null
        : authors
            .map(
              (a) => a.literal || `${a.given || ''} ${a.family || ''}`.trim(),
            )
            .join(', ');
    }
    return this._authorStringCache;
  }

  get containerTitle(): string | undefined {
    return this.data.parent?.title;
  }

  get DOI(): string | undefined {
    return this.data.doi;
  }

  get ISBN(): string | undefined {
    return this.data.isbn;
  }

  /** Memoized issued date — Date construction runs at most once per entry. */
  private _issuedDateCache?: Date | null;

  get issuedDate(): Date | null {
    if (this._issuedDateCache === undefined) {
      this._issuedDateCache = this.data.date ? toDate(this.data.date) : null;
    }
    return this._issuedDateCache;
  }

  get page(): string | undefined {
    return this.data.page;
  }

  get title(): string | undefined {
    return this.data.title;
  }

  get titleShort(): string | undefined {
    return undefined;
  }

  get URL(): string | undefined {
    return this.data.url;
  }

  get publisher(): string | undefined {
    return this.data.publisher || this.data.parent?.publisher;
  }

  get publisherPlace(): string | undefined {
    return undefined;
  }

  get eventPlace(): string | undefined {
    return undefined;
  }

  get language(): string | undefined {
    return this.data.language;
  }

  get source(): string | undefined {
    return undefined;
  }

  get zoteroId(): string | undefined {
    return undefined;
  }

  get keywords(): string[] | undefined {
    return undefined;
  }

  get series(): string | undefined {
    return this.data.serial;
  }

  get volume(): string | undefined {
    return this.data.volume || this.data.parent?.volume;
  }
}
