/**
 * Benchmark: BibLaTeX parsing throughput (the worker-side workload).
 * Catches P2-4 sizing questions (how long one parse occupies a worker)
 * from docs/performance-analysis.md.
 */
import { loadEntries } from '../../src/core';
import { generateBibTeX, timeSync } from './bench-helpers';

const MB = 1024 * 1024;

describe('BibLaTeX parse benchmark', () => {
  test.each([1, 10])(
    'parse ~%i MB of generated BibTeX',
    (sizeMb) => {
      const raw = generateBibTeX(sizeMb * MB);
      console.debug(
        `[bench] generated ${(raw.length / MB).toFixed(1)} MB of BibTeX`,
      );

      const { ms } = timeSync(`loadEntries(biblatex, ~${sizeMb}MB)`, () => {
        const result = loadEntries(raw, 'biblatex');
        expect(result.entries.length).toBeGreaterThan(0);
        expect(result.parseErrors).toHaveLength(0);
      });

      // Throughput guard only — the parse runs in a worker in production,
      // so this bounds worker occupancy, not main-thread time.
      expect(ms).toBeLessThan(sizeMb * 30_000);
    },
    600_000,
  );
});
