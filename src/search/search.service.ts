import MiniSearch from 'minisearch';
import { Entry } from '../core';

// Search field boost weights. Identifier fields (year/id/zoteroId) keep the
// default weight of 1; note/highlight text is weighted below them so a
// title or author match always outranks a note-only match.
const TITLE_BOOST = 2;
const AUTHOR_BOOST = 1.5;
const NOTES_BOOST = 0.5;

/**
 * Strip diacritical marks (accents) and convert to lowercase.
 * Uses Unicode NFD decomposition to separate base characters from
 * combining marks, then removes the combining marks.
 */
export function normalizeTerm(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Full-text search over bibliography entries powered by MiniSearch.
 * Supports fuzzy matching, prefix search, and diacritics normalization.
 */
export class SearchService {
  private index: MiniSearch;
  private isIndexing = false;

  constructor() {
    // Handle ESM/CJS interop: some bundlers nest the constructor under `.default`.
    const MiniSearchConstructor: typeof MiniSearch =
      (MiniSearch as unknown as { default?: typeof MiniSearch }).default ??
      MiniSearch;
    this.index = new MiniSearchConstructor({
      fields: ['title', 'authorString', 'year', 'id', 'zoteroId', 'notesText'],
      storeFields: ['id'],
      // Normalize diacritics at index time so accented characters match their base forms
      processTerm: (term: string) => normalizeTerm(term),
      searchOptions: {
        // notesText is weighted below identifier fields so a title/author match
        // always outranks a match found only inside highlight/note text.
        boost: {
          title: TITLE_BOOST,
          authorString: AUTHOR_BOOST,
          notesText: NOTES_BOOST,
        },
        fuzzy: 0.2,
        prefix: true,
        // Normalize diacritics at search time to match indexed terms
        processTerm: (term: string) => normalizeTerm(term),
      },
    });
  }

  public buildIndex(entries: Entry[]): void {
    this.isIndexing = true;

    this.index.removeAll();

    const docs = entries.map((entry) => entry.toSearchDocument());
    this.index.addAll(docs);
    this.isIndexing = false;
  }

  public search(query: string): string[] {
    if (!query) return [];
    // Return top 50 results IDs
    const results = this.index.search(query);
    return results.map((r) => r.id as string);
  }

  public get isReady(): boolean {
    return !this.isIndexing;
  }
}
