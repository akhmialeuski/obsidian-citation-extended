/**
 * CRAP per function: `complexity² × (1 − coverage)³ + complexity` (Savoia and Evans, crap4j).
 *
 * ESLint's `complexity` rule, run with a maximum of 0, supplies every function's complexity, and Istanbul's
 * `coverage-final.json` supplies its coverage. This module only joins the two reports and compares the scores
 * with the recorded baseline. `tools/crap-gate.mjs` reads the inputs and writes the results.
 */
import { relative, sep } from 'node:path';
import type { ESLint } from 'eslint';

export const CRAP_THRESHOLD = 8;

/** Recorded CRAP by function key. A recorded function may keep its score but not raise it. */
export type Baseline = Record<string, number>;

interface Position {
  line: number;
  column: number;
}

interface Range {
  start: Position;
  end: Position;
}

/** The part of one `coverage-final.json` entry the gate reads. */
export interface FileCoverage {
  fnMap: Record<string, { name: string; decl: Range; loc: Range }>;
  f: Record<string, number>;
  statementMap: Record<string, Range>;
  s: Record<string, number>;
  branchMap: Record<string, { loc: Range }>;
  b: Record<string, number[]>;
}

export interface Score {
  key: string;
  path: string;
  name: string;
  line: number;
  complexity: number;
  coverage: number;
  crap: number;
}

/** A function as ESLint reports it: where its head ends, and its name when it has one. */
interface Reported {
  line: number;
  head: Position;
  complexity: number;
  name?: string;
}

const COMPLEXITY_MESSAGE = /^(.*?)(?: '(.+)')? has a complexity of (\d+)/;
// ESLint scores these too, but they are not functions, so Istanbul has no coverage entry for them.
const NOT_FUNCTIONS = new Set([
  'Class field initializer',
  'Class static block',
]);

const compare = (a: Position, b: Position): number =>
  a.line - b.line || a.column - b.column;

const share = (hits: number[]): number =>
  hits.length === 0 ? 1 : hits.filter((hit) => hit > 0).length / hits.length;

function reported(result: ESLint.LintResult): Reported[] {
  const found: Reported[] = [];
  for (const message of result.messages) {
    const match = COMPLEXITY_MESSAGE.exec(message.message);
    if (
      message.ruleId !== 'complexity' ||
      !match ||
      NOT_FUNCTIONS.has(match[1])
    )
      continue;
    found.push({
      line: message.line,
      // ESLint columns are 1-based and Istanbul columns 0-based.
      head: {
        line: message.endLine ?? message.line,
        column: (message.endColumn ?? message.column) - 1,
      },
      complexity: Number(match[3]),
      name: match[2],
    });
  }
  return found;
}

/**
 * ESLint places a function at its head, which ends at the opening parenthesis or the arrow, while Istanbul's
 * `loc` starts at the body, a line lower once Prettier wraps the parameters. So the match is the innermost
 * Istanbul function whose span, from `decl` to the end of the body, holds the end of the head.
 */
function locate(file: FileCoverage, head: Position): string | undefined {
  return Object.keys(file.fnMap)
    .filter(
      (id) =>
        compare(file.fnMap[id].decl.start, head) <= 0 &&
        compare(head, file.fnMap[id].loc.end) <= 0,
    )
    .sort((a, b) =>
      compare(file.fnMap[b].decl.start, file.fnMap[a].decl.start),
    )[0];
}

/**
 * The lower of the function's statement and branch coverage, or 0 when it was never called or Istanbul does not
 * know it. Statements and branches belong to the function when they start on a line of its body and outside every
 * function nested in it, because ESLint's complexity of a function leaves its nested functions out too.
 */
function functionCoverage(file: FileCoverage, id: string | undefined): number {
  if (id === undefined || file.f[id] === 0) return 0;
  const { start, end } = file.fnMap[id].loc;
  const nested = Object.values(file.fnMap)
    .map((fn) => fn.loc)
    .filter(
      (loc) => compare(loc.start, start) > 0 && compare(loc.end, end) <= 0,
    );
  const inBody = (range: Range): boolean =>
    range.start.line >= start.line &&
    range.start.line <= end.line &&
    !nested.some(
      (loc) =>
        compare(loc.start, range.start) <= 0 &&
        compare(range.start, loc.end) <= 0,
    );
  const statements = Object.entries(file.statementMap)
    .filter(([, range]) => inBody(range))
    .map(([key]) => file.s[key]);
  const branches = Object.entries(file.branchMap)
    .filter(([, branch]) => inBody(branch.loc))
    .flatMap(([key]) => file.b[key]);
  return Math.min(share(statements), share(branches));
}

/**
 * Score every function ESLint reported. A function is keyed by its file and its name: ESLint's name, else
 * Istanbul's, else its line, with `#2`, `#3` for a name repeated in one file. A file the coverage report does not
 * hold is skipped, because Jest's `collectCoverageFrom` left it out on purpose.
 */
export function scoreFunctions(
  results: ESLint.LintResult[],
  coverage: Record<string, FileCoverage>,
  root: string,
): Score[] {
  const scores: Score[] = [];
  for (const result of results) {
    const path = relative(root, result.filePath).split(sep).join('/');
    const file = coverage[result.filePath];
    if (file === undefined) continue;
    const seen = new Map<string, number>();
    for (const fn of reported(result)) {
      const id = locate(file, fn.head);
      const base = fn.name ?? (id ? file.fnMap[id].name : `line ${fn.line}`);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const name = count === 1 ? base : `${base}#${count}`;
      const covered = functionCoverage(file, id);
      const crap = fn.complexity ** 2 * (1 - covered) ** 3 + fn.complexity;
      scores.push({
        key: `${path}::${name}`,
        path,
        name,
        line: fn.line,
        complexity: fn.complexity,
        coverage: covered,
        crap: Math.round(crap * 10_000) / 10_000,
      });
    }
  }
  return scores;
}

/** One line per function over the threshold that the baseline does not record at that score or higher, worst first. */
export function violations(scores: Score[], baseline: Baseline): string[] {
  return scores
    .filter(
      (score) =>
        score.crap > CRAP_THRESHOLD && score.crap > (baseline[score.key] ?? -1),
    )
    .sort((a, b) => b.crap - a.crap)
    .map(
      (score) =>
        `${score.path}:${score.line}: ${score.name} CRAP ${score.crap.toFixed(2)} ` +
        `(complexity ${score.complexity}, coverage ${Math.round(score.coverage * 100)}%), ` +
        `the limit is ${CRAP_THRESHOLD}`,
    );
}

/**
 * The baseline after this run: every function over the threshold at its current score when nothing is recorded
 * yet, otherwise only the recorded functions still over it, each at the lower of its two scores.
 */
export function improvedBaseline(
  scores: Score[],
  recorded?: Baseline,
): Baseline {
  const next: Baseline = {};
  for (const score of scores) {
    if (score.crap <= CRAP_THRESHOLD) continue;
    if (!recorded) next[score.key] = score.crap;
    else if (score.key in recorded)
      next[score.key] = Math.min(score.crap, recorded[score.key]);
  }
  return next;
}
