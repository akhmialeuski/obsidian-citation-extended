/**
 * Benchmark: SearchService.buildIndex with realistic notesText sizes.
 * Catches P1-2 (index build cost) from docs/performance-analysis.md.
 */
import { SearchService } from '../../src/search/search.service';
import { makeAdapters, timeAsync } from './bench-helpers';

const ENTRY_COUNT = 10_000;

describe(`index build benchmark (${ENTRY_COUNT} real adapters)`, () => {
  test.each([0, 1_000, 5_000])(
    'buildIndex with %i note chars per entry',
    async (noteChars) => {
      const entries = makeAdapters(ENTRY_COUNT, noteChars);
      const service = new SearchService();

      const { ms } = await timeAsync(
        `buildIndex(${ENTRY_COUNT} entries, ${noteChars} note chars)`,
        () => service.buildIndex(entries),
      );

      // Loose guard: the build is async/chunked, so wall-clock time matters
      // less than main-thread slices, but a regression past this is real.
      expect(ms).toBeLessThan(30_000);
      expect(service.search('cognitive').length).toBeGreaterThan(0);
    },
    120_000,
  );
});
