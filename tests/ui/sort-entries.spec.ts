import {
  sortEntries,
  ReferenceListSortOrder,
} from '../../src/ui/modals/sort-entries';
import { Entry } from '../../src/core';

/**
 * Minimal stub that satisfies the Entry abstract class contract
 * for the fields used by sortEntries.
 */
function makeEntry(overrides: {
  id: string;
  year?: number;
  authorString?: string | null;
}): Entry {
  return {
    id: overrides.id,
    get year() {
      return overrides.year;
    },
    authorString: overrides.authorString ?? null,
  } as unknown as Entry;
}

describe('sortEntries', () => {
  const entryA = makeEntry({
    id: 'a',
    year: 2020,
    authorString: 'Charlie Brown',
  });
  const entryB = makeEntry({
    id: 'b',
    year: 2023,
    authorString: 'Alice Smith',
  });
  const entryC = makeEntry({
    id: 'c',
    year: 2018,
    authorString: 'Bob Jones',
  });
  const entryNoYear = makeEntry({
    id: 'no-year',
    year: undefined,
    authorString: 'Diana Prince',
  });
  const entryNoAuthor = makeEntry({
    id: 'no-author',
    year: 2021,
    authorString: null,
  });

  const entries = [entryA, entryB, entryC, entryNoYear, entryNoAuthor];

  describe('default order', () => {
    it('returns entries in the original order', () => {
      const result = sortEntries(entries, 'default');
      expect(result).toEqual(entries);
    });

    it('returns the same array reference for default order', () => {
      const result = sortEntries(entries, 'default');
      expect(result).toBe(entries);
    });
  });

  describe('year-desc (newest first)', () => {
    it('sorts by year descending', () => {
      const result = sortEntries(entries, 'year-desc');
      const ids = result.map((e) => e.id);
      expect(ids).toEqual(['b', 'no-author', 'a', 'c', 'no-year']);
    });

    it('places entries without a year at the end', () => {
      const result = sortEntries(entries, 'year-desc');
      expect(result[result.length - 1].id).toBe('no-year');
    });

    it('does not mutate the original array', () => {
      const original = [...entries];
      sortEntries(entries, 'year-desc');
      expect(entries).toEqual(original);
    });
  });

  describe('year-asc (oldest first)', () => {
    it('sorts by year ascending', () => {
      const result = sortEntries(entries, 'year-asc');
      const ids = result.map((e) => e.id);
      expect(ids).toEqual(['c', 'a', 'no-author', 'b', 'no-year']);
    });

    it('places entries without a year at the end', () => {
      const result = sortEntries(entries, 'year-asc');
      expect(result[result.length - 1].id).toBe('no-year');
    });
  });

  describe('author-asc (alphabetical by author)', () => {
    it('sorts by authorString ascending', () => {
      const result = sortEntries(entries, 'author-asc');
      const ids = result.map((e) => e.id);
      expect(ids).toEqual(['b', 'c', 'a', 'no-year', 'no-author']);
    });

    it('places entries without an author at the end', () => {
      const result = sortEntries(entries, 'author-asc');
      expect(result[result.length - 1].id).toBe('no-author');
    });
  });

  describe('edge cases', () => {
    it('handles an empty array', () => {
      const result = sortEntries([], 'year-desc');
      expect(result).toEqual([]);
    });

    it('handles a single entry', () => {
      const result = sortEntries([entryA], 'year-desc');
      expect(result).toEqual([entryA]);
    });

    it('handles all entries missing year', () => {
      const noYearEntries = [
        makeEntry({ id: 'x', year: undefined, authorString: 'X' }),
        makeEntry({ id: 'y', year: undefined, authorString: 'Y' }),
      ];
      const result = sortEntries(noYearEntries, 'year-desc');
      expect(result.map((e) => e.id)).toEqual(['x', 'y']);
    });

    it('handles all entries missing authorString', () => {
      const noAuthorEntries = [
        makeEntry({ id: 'x', year: 2020, authorString: null }),
        makeEntry({ id: 'y', year: 2021, authorString: null }),
      ];
      const result = sortEntries(noAuthorEntries, 'author-asc');
      expect(result.map((e) => e.id)).toEqual(['x', 'y']);
    });

    it('handles entries with the same year (stable relative order)', () => {
      const sameYear = [
        makeEntry({ id: 'first', year: 2020, authorString: 'A' }),
        makeEntry({ id: 'second', year: 2020, authorString: 'B' }),
        makeEntry({ id: 'third', year: 2020, authorString: 'C' }),
      ];
      const result = sortEntries(sameYear, 'year-desc');
      // All have the same year, so comparator returns 0 => stable order preserved
      expect(result.map((e) => e.id)).toEqual(['first', 'second', 'third']);
    });

    it('accepts all valid sort orders', () => {
      const orders: ReferenceListSortOrder[] = [
        'default',
        'year-desc',
        'year-asc',
        'author-asc',
      ];
      for (const order of orders) {
        expect(() => sortEntries(entries, order)).not.toThrow();
      }
    });
  });
});
