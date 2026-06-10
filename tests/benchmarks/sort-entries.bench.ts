/**
 * Benchmark: sortEntries over REAL adapters (not value mocks).
 * Catches P2-1 (getter cost in comparators) from docs/performance-analysis.md.
 * Mock entries with plain fields would hide the cost of authorString/year
 * derivation, which is precisely what this benchmark exists to measure.
 */
import { sortEntries } from '../../src/library/sort-entries';
import type { ReferenceListSortOrder } from '../../src/library/sort-entries';
import { makeAdapters, timeSync } from './bench-helpers';

const ENTRY_COUNT = 10_000;

describe(`sortEntries benchmark (${ENTRY_COUNT} real adapters)`, () => {
  const orders: ReferenceListSortOrder[] = [
    'year-desc',
    'year-asc',
    'author-asc',
  ];

  test.each(orders)(
    'sort %s (cold getters)',
    (order) => {
      // Fresh adapters: first sort pays the derivation cost once (memoized).
      const entries = makeAdapters(ENTRY_COUNT);
      const { ms } = timeSync(`sortEntries(${order}) cold`, () => {
        sortEntries(entries, order);
      });
      expect(ms).toBeLessThan(2_000);
    },
    60_000,
  );

  test('repeat sort is fast thanks to memoized getters', () => {
    const entries = makeAdapters(ENTRY_COUNT);
    sortEntries(entries, 'year-desc'); // warm-up: memoize year/issuedDate
    const { ms } = timeSync('sortEntries(year-desc) warm', () => {
      sortEntries(entries, 'year-desc');
    });
    expect(ms).toBeLessThan(500);
  });
});
