import MiniSearch, { Options } from 'minisearch';
import type { SearchDocument } from '../core';

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
 * Resolve the MiniSearch constructor across ESM/CJS interop: some bundlers
 * nest the constructor under `.default`.
 */
export function resolveMiniSearch(): typeof MiniSearch {
  return (
    (MiniSearch as unknown as { default?: typeof MiniSearch }).default ??
    MiniSearch
  );
}

/**
 * The single source of truth for index/search options. Shared by the
 * main-thread SearchService and the worker-side index builder, so an index
 * serialized in the worker deserializes against IDENTICAL options — MiniSearch
 * requires that for `loadJSON`.
 */
export function createMiniSearchOptions(): Options {
  return {
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
  };
}

/** Create a fresh, empty MiniSearch index with the standard options. */
export function createSearchIndex(): MiniSearch {
  const MiniSearchConstructor = resolveMiniSearch();
  return new MiniSearchConstructor(createMiniSearchOptions());
}

/**
 * Build a search index from documents and serialize it to JSON.
 * Runs inside the Web Worker (see worker.ts), where the synchronous
 * tokenization cost cannot block the UI.
 */
export function buildSearchIndexJson(documents: SearchDocument[]): string {
  const index = createSearchIndex();
  index.addAll(documents);
  return JSON.stringify(index);
}

/**
 * Deserialize an index produced by {@link buildSearchIndexJson}, parsing
 * asynchronously (in chunks) to keep the main thread responsive.
 */
export function loadSearchIndexJson(json: string): Promise<MiniSearch> {
  return resolveMiniSearch().loadJSONAsync(json, createMiniSearchOptions());
}
