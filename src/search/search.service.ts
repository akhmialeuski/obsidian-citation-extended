import MiniSearch from 'minisearch';
import { Entry } from '../core';

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
    // Handle potential interoperability issues with MiniSearch import
    // @ts-expect-error -- minisearch types are not perfect
    const MiniSearchConstructor = MiniSearch.default || MiniSearch;
    this.index = new MiniSearchConstructor({
      fields: ['title', 'authorString', 'year', 'id', 'zoteroId'],
      storeFields: ['id'],
      // Normalize diacritics at index time so accented characters match their base forms
      processTerm: (term: string) => normalizeTerm(term),
      searchOptions: {
        boost: { title: 2, authorString: 1.5 },
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
    return results.map((r) => r.id);
  }

  public get isReady(): boolean {
    return !this.isIndexing;
  }
}
