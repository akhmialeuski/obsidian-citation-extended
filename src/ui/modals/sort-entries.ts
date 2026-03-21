import { Entry } from '../../core';

/**
 * Supported sort orders for the citation reference list modal.
 */
export type ReferenceListSortOrder =
  | 'default'
  | 'year-desc'
  | 'year-asc'
  | 'author-asc';

/**
 * Sort an array of entries according to the given sort order.
 * Returns a new sorted array (does not mutate the input).
 *
 * - `'default'`    — preserve original order (no sorting)
 * - `'year-desc'`  — newest first; entries without a year sink to the bottom
 * - `'year-asc'`   — oldest first; entries without a year sink to the bottom
 * - `'author-asc'` — alphabetical by authorString; entries without an author sink to the bottom
 */
export function sortEntries(
  entries: Entry[],
  order: ReferenceListSortOrder,
): Entry[] {
  if (order === 'default') {
    return entries;
  }

  // Shallow copy so we don't mutate the caller's array
  const sorted = [...entries];

  switch (order) {
    case 'year-desc':
      sorted.sort((a, b) => {
        const yearA = a.year;
        const yearB = b.year;
        // Entries without a year go to the end
        if (yearA == null && yearB == null) return 0;
        if (yearA == null) return 1;
        if (yearB == null) return -1;
        return yearB - yearA;
      });
      break;

    case 'year-asc':
      sorted.sort((a, b) => {
        const yearA = a.year;
        const yearB = b.year;
        if (yearA == null && yearB == null) return 0;
        if (yearA == null) return 1;
        if (yearB == null) return -1;
        return yearA - yearB;
      });
      break;

    case 'author-asc':
      sorted.sort((a, b) => {
        const authorA = a.authorString;
        const authorB = b.authorString;
        // Entries without an author go to the end
        if (!authorA && !authorB) return 0;
        if (!authorA) return 1;
        if (!authorB) return -1;
        return authorA.localeCompare(authorB);
      });
      break;
  }

  return sorted;
}
