import { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';
export { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';

import { Author, Entry } from '../types/entry';
import { EntryDataCSL } from './csl-adapter';

export type EntryData = EntryDataCSL | EntryDataBibLaTeX;

export function isEntryDataBibLaTeX(
  entry: EntryData,
): entry is EntryDataBibLaTeX {
  return (entry as EntryDataBibLaTeX).key !== undefined;
}

export class EntryBibLaTeXAdapter extends Entry {
  abstract?: string;
  _containerTitle?: string;
  containerTitleShort?: string;
  DOI?: string;
  ISBN?: string;
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
    this.ISBN = this.getField('isbn');
    this.eprint = this.getField('eprint');
    this.eprinttype = this.getField('eprinttype');
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

  /**
   * Normalize file paths from various BibTeX exporters.
   * Mendeley uses `:C\:\\Project/Literature/MyPDF.pdf:PDF` format.
   */
  private static normalizeFilePath(filePath: string): string {
    let p = filePath.trim();
    // Mendeley format: :C\:\\path:PDF -- strip leading colon and trailing :TYPE
    if (p.match(/^:[A-Za-z][\\/]/)) {
      p = p.substring(1);
    }
    // Strip trailing :TYPE indicator (e.g. :PDF, :HTML).
    // Safe: [A-Za-z]+$ only matches pure-letter suffixes -- filenames with dots/numbers won't match.
    p = p.replace(/:[A-Za-z]+$/, '');
    // BibTeX escaped colon (Mendeley: C\:\\path -> C:\\path after unescape)
    p = p.replace(/\\:/g, ':');
    // Normalize backslashes to forward slashes
    p = p.replace(/\\\\/g, '/').replace(/\\/g, '/');
    return p;
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

    return ret
      .map((f) => EntryBibLaTeXAdapter.normalizeFilePath(f))
      .filter((f) => f.length > 0);
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
