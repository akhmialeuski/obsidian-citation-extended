import { Author, Entry } from '../types/entry';

export interface EntryDataCSL {
  id: string;
  type: string;

  abstract?: string;
  author?: Author[];
  editor?: Author[];
  'container-title'?: string;
  DOI?: string;
  ISBN?: string;
  keyword?: string;
  'event-place'?: string;
  issued?: { 'date-parts': [(number | string)[]] };
  language?: string;
  page?: string;
  publisher?: string;
  'publisher-place'?: string;
  source?: string;
  title?: string;
  'title-short'?: string;
  URL?: string;
  'zotero-key'?: string;
  'collection-title'?: string;
  volume?: string;
}

export function isEntryDataCSL(
  entry: EntryDataCSL | { key?: string },
): entry is EntryDataCSL {
  return (entry as EntryDataCSL).id !== undefined;
}

export class EntryCSLAdapter extends Entry {
  constructor(private data: EntryDataCSL) {
    super();
  }

  eprint: string | null = null;
  eprinttype: string | null = null;
  files: string[] | null = null;

  _sourceDatabase?: string;
  _compositeCitekey?: string;
  private _id?: string;

  get year(): number | undefined {
    const year = this.data.issued?.['date-parts']?.[0]?.[0];
    if (year !== undefined && year !== null) {
      const y = typeof year === 'string' ? parseInt(year) : year;
      if (!isNaN(y)) {
        return y;
      }
    }
    return this.issuedDate?.getUTCFullYear();
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
    return this.data.type;
  }

  get abstract(): string | undefined {
    return this.data.abstract;
  }
  get author(): Author[] | undefined {
    return this.data.author;
  }

  get authorString(): string | null {
    if (this.data.author) {
      return this.data.author
        .map((a) => a.literal || `${a.given || ''} ${a.family || ''}`.trim())
        .join(', ');
    }
    if (this.data.editor) {
      const editors = this.data.editor
        .map((a) => a.literal || `${a.given || ''} ${a.family || ''}`.trim())
        .join(', ');
      return `${editors} (Eds.)`;
    }
    return null;
  }

  get containerTitle(): string | undefined {
    return this.data['container-title'];
  }

  get DOI(): string | undefined {
    return this.data.DOI;
  }

  get ISBN(): string | undefined {
    return this.data.ISBN;
  }

  get eventPlace(): string | undefined {
    return this.data['event-place'];
  }

  get language(): string | undefined {
    return this.data.language;
  }

  get source(): string | undefined {
    return this.data.source;
  }

  get issuedDate(): Date | null {
    if (
      !(
        this.data.issued &&
        this.data.issued['date-parts'] &&
        this.data.issued['date-parts'][0].length > 0
      )
    )
      return null;

    const [year, month, day] = this.data.issued['date-parts'][0];
    const y = typeof year === 'string' ? parseInt(year) : year;
    const m = typeof month === 'string' ? parseInt(month) : month;
    const d = typeof day === 'string' ? parseInt(day) : day;

    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  }

  get page(): string | undefined {
    return this.data.page;
  }

  get publisher(): string | undefined {
    return this.data.publisher;
  }

  get publisherPlace(): string | undefined {
    return this.data['publisher-place'];
  }

  get series(): string | undefined {
    return this.data['collection-title'];
  }

  get volume(): string | undefined {
    return this.data.volume;
  }

  get title(): string | undefined {
    return this.data.title;
  }

  get titleShort(): string | undefined {
    return this.data['title-short'];
  }

  get URL(): string | undefined {
    return this.data.URL;
  }

  get zoteroId(): string | undefined {
    return this.data['zotero-key'];
  }

  get keywords(): string[] | undefined {
    return this.data.keyword?.split(',').map((s) => s.trim());
  }
}
