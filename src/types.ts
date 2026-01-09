import * as BibTeXParser from '@retorquere/bibtex-parser';
import { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';
// Also make EntryDataBibLaTeX available to other modules
export { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';

export const databaseTypes = ['csl-json', 'biblatex'] as const;
export type DatabaseType = (typeof databaseTypes)[number];

export interface DatabaseConfig {
  name: string;
  path: string;
  type: DatabaseType;
}

export interface TemplateContext {
  citekey: string;
  abstract?: string;
  authorString?: string | null;
  containerTitle?: string;
  DOI?: string;
  eprint?: string | null;
  eprinttype?: string | null;
  eventPlace?: string;
  keywords?: string[];
  language?: string;
  note?: string;
  page?: string;
  publisher?: string;
  publisherPlace?: string;
  series?: string;
  volume?: string;
  source?: string;
  title?: string;
  titleShort?: string;
  type: string;
  URL?: string;
  year?: string;
  zoteroSelectURI: string;
  zoteroId?: string;
  date?: string | null;

  entry: Record<string, unknown>;
}

export class Library {
  constructor(public entries: { [citekey: string]: Entry }) {}

  get size(): number {
    return Object.keys(this.entries).length;
  }
}

/**
 * Load reference entries from the given raw database data.
 *
 * Returns a list of `EntryData`, which should be wrapped with the relevant
 * adapter and used to instantiate a `Library`.
 */
export function loadEntries(
  databaseRaw: string,
  databaseType: DatabaseType,
): EntryData[] {
  let libraryArray: EntryData[] = [];

  if (databaseType == 'csl-json') {
    libraryArray = JSON.parse(databaseRaw);
  } else if (databaseType == 'biblatex') {
    const options: BibTeXParser.ParserOptions = {
      errorHandler: (err) => {
        console.warn(
          'Citation plugin: non-fatal error loading BibLaTeX entry:',
          err,
        );
      },
    };

    const parsed = BibTeXParser.parse(
      databaseRaw,
      options,
    ) as BibTeXParser.Bibliography;

    parsed.errors.forEach((error) => {
      console.error(
        `Citation plugin: fatal error loading BibLaTeX entry` +
          ` (line ${error.line}, column ${error.column}):`,
        error.message,
      );
    });

    libraryArray = parsed.entries;
  }

  return libraryArray;
}

export interface Author {
  given?: string;
  family?: string;
  literal?: string;
}

/**
 * An `Entry` represents a single reference in a reference database.
 * Each entry has a unique identifier, known in most reference managers as its
 * "citekey."
 */
export abstract class Entry {
  /**
   * Unique identifier for the entry (also the citekey).
   */
  public abstract id: string;

  public abstract type: string;

  public abstract abstract?: string;
  public abstract author?: Author[];

  /**
   * A comma-separated list of authors, each of the format `<firstname> <lastname>`.
   */
  public abstract authorString?: string | null;

  /**
   * The name of the container for this reference -- in the case of a book
   * chapter reference, the name of the book; in the case of a journal article,
   * the name of the journal.
   */
  public abstract containerTitle?: string;

  public abstract DOI?: string;
  public abstract files?: string[] | null;

  /**
   * The date of issue. Many references do not contain information about month
   * and day of issue; in this case, the `issuedDate` will contain dummy minimum
   * values for those elements. (A reference which is only encoded as being
   * issued in 2001 is represented here with a date 2001-01-01 00:00:00 UTC.)
   */
  public abstract issuedDate?: Date | null;

  /**
   * Page or page range of the reference.
   */
  public abstract page?: string;
  public abstract title?: string;
  public abstract titleShort?: string;
  public abstract URL?: string;

  public abstract zoteroId?: string;

  public abstract keywords?: string[];

  public abstract eventPlace?: string;

  public abstract language?: string;

  public abstract source?: string;

  public abstract publisher?: string;
  public abstract publisherPlace?: string;

  public abstract series?: string;
  public abstract volume?: string;

  public abstract _sourceDatabase?: string;
  public abstract _compositeCitekey?: string;

  public abstract get citekey(): string;

  /**
   * BibLaTeX-specific properties
   */
  public abstract eprint?: string | null;
  public abstract eprinttype?: string | null;

  protected _year?: string;
  public get year(): number | undefined {
    return this._year
      ? parseInt(this._year)
      : this.issuedDate?.getUTCFullYear();
  }

  protected _note?: string[];

  public get note(): string {
    return (
      this._note
        ?.map((el) => {
          // Check if the element contains an HTML anchor tag from bibtex-parser
          if (el.match(/<a href="[^"]+">[^<]+<\/a>/)) {
            return el.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '[$2]($1)');
          }
          // Fallback for older parser versions or raw links (though regex below was problematic, we'll keep a safer version if needed or just drop it if v6 covers everything)
          // The previous regex was: .replace(/(zotero:\/\/[^})\s]+)/g, '[Link]($1)')
          // We can keep a fallback but make it less aggressive or just rely on the parser.
          // Given the issue, let's just do the conversion if it's an anchor tag, otherwise return text.
          return el;
        })
        .join('\n\n') || ''
    );
  }

  /**
   * A URI which will open the relevant entry in the Zotero client.
   */
  public get zoteroSelectURI(): string {
    return `zotero://select/items/@${this.citekey}`;
  }

  toJSON(): Record<string, unknown> {
    const jsonObj = { ...this } as Record<string, unknown>;

    // add getter values
    const proto = Object.getPrototypeOf(this);
    Object.entries(Object.getOwnPropertyDescriptors(proto))
      .filter(([, descriptor]) => typeof descriptor.get == 'function')
      .forEach(([key, descriptor]) => {
        if (descriptor && key[0] !== '_') {
          try {
            const val = (this as unknown as Record<string, unknown>)[key];
            jsonObj[key] = val;
          } catch {
            return;
          }
        }
      });

    return jsonObj;
  }
}

export type EntryData = EntryDataCSL | EntryDataBibLaTeX;

export interface EntryDataCSL {
  id: string;
  type: string;

  abstract?: string;
  author?: Author[];
  editor?: Author[];
  'container-title'?: string;
  DOI?: string;
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

export interface WorkerRequest {
  databaseRaw: string;
  databaseType: DatabaseType;
}

export type WorkerResponse = EntryData[];

export function isEntryDataCSL(entry: EntryData): entry is EntryDataCSL {
  return (entry as EntryDataCSL).id !== undefined;
}

export function isEntryDataBibLaTeX(
  entry: EntryData,
): entry is EntryDataBibLaTeX {
  return (entry as EntryDataBibLaTeX).key !== undefined;
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

export class EntryBibLaTeXAdapter extends Entry {
  abstract?: string;
  _containerTitle?: string;
  containerTitleShort?: string;
  DOI?: string;
  eprint?: string;
  eprinttype?: string;
  event?: string;
  eventPlace?: string;
  issued?: string;
  language?: string;
  page?: string;
  publisher?: string;
  publisherPlace?: string;
  series?: string;
  volume?: string;
  source?: string;
  title?: string;
  titleShort?: string;
  URL?: string;
  _year?: string;
  _note?: string[];
  keywords?: string[];
  zoteroId?: string;

  _sourceDatabase?: string;
  _compositeCitekey?: string;
  private _id?: string;

  constructor(private data: EntryDataBibLaTeX) {
    super();

    this.abstract = this.getField('abstract');
    this._containerTitle =
      this.getField('booktitle') ||
      this.getField('journal') ||
      this.getField('journaltitle');
    this.containerTitleShort = this.getField('shortjournal');
    this.DOI = this.getField('doi');
    this.eprint = this.getField('eprint');
    this.eprinttype = this.getField('eprinttype');
    this.event = this.getField('eventtitle');
    this.event = this.getField('eventtitle');
    // BibLaTeX 'venue' or 'location' (if event is present) could be eventPlace.
    // Standard mapping: venue is often used for event place.
    this.eventPlace = this.getField('venue') || this.getField('location');
    this.series = this.getField('series');
    this.volume = this.getField('volume');
    this.issued = this.getField('date');
    this.page = this.getField('pages');
    this.publisher = this.getField('publisher');
    this.publisherPlace = this.getField('location');
    this.title = this.getField('title');
    this.titleShort = this.getField('shorttitle');
    this.URL = this.getField('url');
    this._year = this.getField('year');
    this._note = this.getArrayField('note');
    this.keywords = this.getArrayField('keywords');
    this.zoteroId = this.getField('zotero-key');
  }

  private getField(key: string): string | undefined {
    if (!(key in this.data.fields)) return undefined;
    const val = this.data.fields[key];
    return Array.isArray(val) ? val[0] : val;
  }

  private getArrayField(key: string): string[] | undefined {
    if (!(key in this.data.fields)) return undefined;
    const val = this.data.fields[key];
    return Array.isArray(val) ? val : [val];
  }

  get id(): string {
    return this._id || this.data.key;
  }
  set id(value: string) {
    this._id = value;
  }

  get citekey(): string {
    return this.data.key;
  }

  get type(): string {
    return this.data.type;
  }

  get files(): string[] {
    // For some reason the bibtex parser doesn't reliably parse file list to
    // array ; so we'll do it manually / redundantly
    let ret: string[] = [];
    if (this.data.fields.file) {
      ret = ret.concat(this.data.fields.file.flatMap((x) => x.split(';')));
    }
    if (this.data.fields.files) {
      ret = ret.concat(this.data.fields.files.flatMap((x) => x.split(';')));
    }

    return ret;
  }

  get authorString(): string | undefined {
    if (this.data.creators.author) {
      const names = this.data.creators.author.map((name) => {
        if (name.literal) return name.literal;
        const parts = [name.firstName, name.prefix, name.lastName, name.suffix];
        // Drop any null parts and join
        return parts.filter((x) => x).join(' ');
      });
      return names.join(', ');
    } else if (this.data.creators.editor) {
      const names = this.data.creators.editor.map((name) => {
        if (name.literal) return name.literal;
        const parts = [name.firstName, name.prefix, name.lastName, name.suffix];
        // Drop any null parts and join
        return parts.filter((x) => x).join(' ');
      });
      return `${names.join(', ')} (Eds.)`;
    } else {
      return this.data.fields.author?.join(', ');
    }
  }

  get containerTitle(): string | undefined {
    if (this._containerTitle) {
      return this._containerTitle;
    } else if (this.eprint) {
      const eprinttype = this.eprinttype;
      const prefix = eprinttype ? `${eprinttype}:` : '';
      const primaryClassVal = this.data.fields.primaryclass;
      const primaryClass = Array.isArray(primaryClassVal)
        ? primaryClassVal[0]
        : primaryClassVal;
      const suffix = primaryClass ? ` [${primaryClass}]` : '';
      return `${prefix}${this.eprint}${suffix}`;
    }
  }

  get issuedDate(): Date | null {
    return this.issued ? new Date(this.issued) : null;
  }

  get author(): Author[] {
    return this.data.creators.author?.map((a) => ({
      given: a.firstName,
      family: a.lastName,
    }));
  }
}
