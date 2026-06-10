/**
 * Shared helpers for the performance benchmark suite.
 *
 * IMPORTANT: benchmarks must exercise REAL adapters (EntryBibLaTeXAdapter and
 * friends), not value-field mocks. Mocks with plain fields hide the cost of
 * derived getters (authorString/issuedDate/year), which is exactly what some
 * benchmarks are designed to measure.
 */
import type { EntryDataBibLaTeX } from '../../src/core';
import { EntryBibLaTeXAdapter } from '../../src/core';

/** Result of a timed run. */
export interface BenchTiming {
  label: string;
  ms: number;
}

/** Measure a synchronous function, returning elapsed milliseconds. */
export function timeSync(label: string, fn: () => void): BenchTiming {
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  console.debug(`[bench] ${label}: ${ms.toFixed(1)}ms`);
  return { label, ms };
}

/** Measure an async function, returning elapsed milliseconds. */
export async function timeAsync(
  label: string,
  fn: () => Promise<void>,
): Promise<BenchTiming> {
  const start = performance.now();
  await fn();
  const ms = performance.now() - start;
  console.debug(`[bench] ${label}: ${ms.toFixed(1)}ms`);
  return { label, ms };
}

const FIRST_NAMES = ['John', 'Jane', 'Max', 'Anna', 'Pierre', 'Olga', 'Wei'];
const LAST_NAMES = [
  'Smith',
  'Doe',
  'Müller',
  'García',
  'Ivanov',
  'Dubois',
  'Chen',
];
const TITLE_WORDS = [
  'cognitive',
  'architecture',
  'quantum',
  'systems',
  'analysis',
  'distributed',
  'memory',
  'networks',
  'inference',
  'learning',
];

/** Deterministic pseudo-random generator so benchmark runs are comparable. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/**
 * Fabricate parser-shaped BibLaTeX entry data (the exact shape
 * `@retorquere/bibtex-parser` produces) without paying parser cost.
 * Used by benchmarks that measure post-parse stages.
 */
export function makeBibLaTeXEntryData(
  i: number,
  rng: () => number,
  noteChars = 0,
): EntryDataBibLaTeX {
  const authorCount = 2 + Math.floor(rng() * 4);
  const authors = Array.from({ length: authorCount }, (_, a) => ({
    firstName: FIRST_NAMES[(i + a) % FIRST_NAMES.length],
    lastName: LAST_NAMES[(i * 3 + a) % LAST_NAMES.length],
  }));
  const title = Array.from(
    { length: 6 },
    (_, w) => TITLE_WORDS[(i + w) % TITLE_WORDS.length],
  ).join(' ');
  const year = 1980 + (i % 45);
  const month = 1 + (i % 12);

  const fields: Record<string, string[]> = {
    title: [`${title} ${i}`],
    date: [`${year}-${String(month).padStart(2, '0')}-15`],
    journal: ['Journal of Benchmarks'],
    pages: ['1--20'],
    doi: [`10.1000/bench.${i}`],
  };
  if (noteChars > 0) {
    fields.note = ['highlight text with serendipity '.repeat(noteChars / 32)];
  }

  return {
    key: `bench${i}`,
    type: 'article',
    fields,
    creators: { author: authors },
  } as unknown as EntryDataBibLaTeX;
}

/** Build N real BibLaTeX adapters with fabricated parser data. */
export function makeAdapters(
  count: number,
  noteChars = 0,
): EntryBibLaTeXAdapter[] {
  const rng = makeRng(42);
  return Array.from(
    { length: count },
    (_, i) =>
      new EntryBibLaTeXAdapter(makeBibLaTeXEntryData(i, rng, noteChars)),
  );
}

/**
 * Generate raw BibTeX text of roughly `approxBytes` size for parser
 * benchmarks. Entry size is ~330 bytes, so count = bytes / 330.
 */
export function generateBibTeX(approxBytes: number): string {
  const entrySize = 330;
  const count = Math.max(1, Math.round(approxBytes / entrySize));
  const rng = makeRng(7);
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const a1 = LAST_NAMES[i % LAST_NAMES.length];
    const a2 = LAST_NAMES[(i * 5 + 1) % LAST_NAMES.length];
    const title = Array.from(
      { length: 6 },
      (_, w) => TITLE_WORDS[(i + w) % TITLE_WORDS.length],
    ).join(' ');
    const year = 1980 + (i % 45);
    chunks.push(
      `@article{gen${i},
  title = {${title} ${i}},
  author = {${a1}, John and ${a2}, Jane and Brown, Bob},
  date = {${year}-0${1 + (i % 9)}-15},
  journaltitle = {Journal of Generated Benchmarks},
  pages = {${1 + (i % 100)}--${20 + (i % 100)}},
  doi = {10.1000/gen.${i}},
  abstract = {Abstract text ${rng().toFixed(4)} about ${title}.},
}
`,
    );
  }
  return chunks.join('\n');
}
