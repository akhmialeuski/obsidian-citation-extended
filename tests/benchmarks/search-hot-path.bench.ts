/**
 * Benchmark: SearchService.search with production options (fuzzy 0.2,
 * prefix, boosts, diacritics processTerm) on a large index.
 * Catches P2-3 (per-keystroke search cost) from docs/performance-analysis.md.
 */
import { SearchService } from '../../src/search/search.service';
import { makeAdapters, timeSync } from './bench-helpers';

const ENTRY_COUNT = 10_000;

describe(`search hot path benchmark (${ENTRY_COUNT} real adapters)`, () => {
  const service = new SearchService();

  beforeAll(async () => {
    await service.buildIndex(makeAdapters(ENTRY_COUNT, 500));
  }, 120_000);

  test('wide single-letter prefix query', () => {
    const { ms } = timeSync('search("a") wide prefix', () => {
      service.search('a');
    });
    expect(ms).toBeLessThan(500);
  });

  test('narrow multi-term query', () => {
    const { ms } = timeSync('search("cognitive architecture")', () => {
      service.search('cognitive architecture');
    });
    expect(ms).toBeLessThan(200);
  });

  test('fuzzy-heavy misspelled query', () => {
    const { ms } = timeSync('search("cognitiv arhitecture") fuzzy', () => {
      service.search('cognitiv arhitecture');
    });
    expect(ms).toBeLessThan(500);
  });

  test('result limit caps returned ids', () => {
    const results = service.search('a', 10);
    expect(results.length).toBeLessThanOrEqual(10);
  });
});
