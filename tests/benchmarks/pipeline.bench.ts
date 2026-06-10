/**
 * Benchmark: NormalizationPipeline.run with multiple sources and duplicates.
 * Catches P3-1 (per-entry cloning cost) from docs/performance-analysis.md.
 */
import {
  NormalizationPipeline,
  SourceTaggingStep,
  DeduplicationStep,
} from '../../src/infrastructure/normalization-pipeline';
import type { SourceLoadResult } from '../../src/infrastructure/normalization-pipeline';
import { makeAdapters, timeSync } from './bench-helpers';

const ENTRIES_PER_SOURCE = 10_000;

describe(`normalization pipeline benchmark (2×${ENTRIES_PER_SOURCE} entries)`, () => {
  test('run with tagging + dedup (50% citekey overlap)', () => {
    // Two sources sharing the same fabricated citekeys -> every entry of the
    // overlapping half goes through the dedup cloning path.
    const sourceA = makeAdapters(ENTRIES_PER_SOURCE);
    const sourceB = makeAdapters(ENTRIES_PER_SOURCE / 2);

    const results: SourceLoadResult[] = [
      {
        sourceId: 'a',
        databaseId: 'db-a',
        databaseName: 'A',
        entries: sourceA,
        parseErrors: [],
      },
      {
        sourceId: 'b',
        databaseId: 'db-b',
        databaseName: 'B',
        entries: sourceB,
        parseErrors: [],
      },
    ];

    const pipeline = new NormalizationPipeline()
      .addStep(new SourceTaggingStep())
      .addStep(new DeduplicationStep());

    const { ms } = timeSync('pipeline.run(2 sources)', () => {
      const library = pipeline.run(results);
      expect(library.size).toBeGreaterThan(0);
    });

    expect(ms).toBeLessThan(5_000);
  }, 60_000);
});
