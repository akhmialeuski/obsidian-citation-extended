import { Author, Entry } from '../types/entry';

/**
 * Raw shape of a Hayagriva YAML entry after parsing.
 * Hayagriva is a YAML-based bibliography format used by Typst.
 * See: https://github.com/typst/hayagriva
 */
export interface HayagrivaEntryData {
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
  private _citekey: string;
  private data: HayagrivaEntryData;

  eprint: string | null = null;
  eprinttype: string | null = null;
  files: string[] | null = null;

  _sourceDatabase?: string;
  _compositeCitekey?: string;
  private _id?: string;

  constructor(citekey: string, data: HayagrivaEntryData) {
    super();
    this._citekey = citekey;
    this.data = data;
  }

  get id(): string {
    return this._id || this._citekey;
  }
  set id(value: string) {
    this._id = value;
  }

  get citekey(): string {
    return this._citekey;
  }

  get type(): string {
    return this.data.type || 'article';
  }

  get abstract(): string | undefined {
    return this.data.abstract;
  }

  get author(): Author[] | undefined {
    const authors = this.data.author;
    if (!authors || !Array.isArray(authors)) return undefined;
    return authors.map(toAuthor);
  }

  get authorString(): string | null {
    const authors = this.author;
    if (!authors) return null;
    return authors
      .map((a) => a.literal || `${a.given || ''} ${a.family || ''}`.trim())
      .join(', ');
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

  get issuedDate(): Date | null {
    if (!this.data.date) return null;
    return toDate(this.data.date);
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
