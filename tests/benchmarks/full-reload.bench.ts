/**
 * Benchmark: full post-parse reload cycle — adapters -> pipeline -> index ->
 * sorted-entries cache. Approximates the main-thread cost of one library
 * reload (parsing excluded; it runs in a worker in production).
 * Catches P1-1 scale (full-work-per-change) from docs/performance-analysis.md.
 */
import {
  NormalizationPipeline,
  SourceTaggingStep,
  DeduplicationStep,
} from '../../src/infrastructure/normalization-pipeline';
import type { SourceLoadResult } from '../../src/infrastructure/normalization-pipeline';
import { SearchService } from '../../src/search/search.service';
import { sortEntries } from '../../src/library/sort-entries';
import { makeAdapters, timeAsync } from './bench-helpers';

const ENTRIES_PER_SOURCE = 5_000;
const SOURCE_COUNT = 2;

describe(`full reload benchmark (${SOURCE_COUNT}×${ENTRIES_PER_SOURCE} entries)`, () => {
  test('pipeline + index + sorted cache', async () => {
    const results: SourceLoadResult[] = Array.from(
      { length: SOURCE_COUNT },
      (_, s) => ({
        sourceId: `s${s}`,
        databaseId: `db-${s}`,
        databaseName: `DB${s}`,
        entries: makeAdapters(ENTRIES_PER_SOURCE, 500),
        parseErrors: [],
      }),
    );

    const pipeline = new NormalizationPipeline()
      .addStep(new SourceTaggingStep())
      .addStep(new DeduplicationStep());
    const searchService = new SearchService();

    const { ms } = await timeAsync('full reload (post-parse)', async () => {
      const library = pipeline.run(results);
      const entries = Object.values(library.entries);
      await searchService.buildIndex(entries);
      // Simulates LibraryService.getSortedEntries cache population.
      sortEntries(entries, 'year-desc');
      expect(library.size).toBeGreaterThan(0);
    });

    expect(ms).toBeLessThan(30_000);
  }, 120_000);
});
