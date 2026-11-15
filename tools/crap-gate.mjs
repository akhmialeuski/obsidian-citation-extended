// Gate the CRAP score of every function in src/ against crap-baseline.json, after `jest --coverage` has written
// coverage/coverage-final.json. With --update-baseline, a green run records improvements only, and a missing
// baseline is seeded. Node runs the TypeScript import directly through its type stripping.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { ESLint } from 'eslint';
import { improvedBaseline, scoreFunctions, violations } from './crap-gate.ts';

const BASELINE = 'crap-baseline.json';
const COVERAGE = 'coverage/coverage-final.json';

const update = parseArgs({
  options: { 'update-baseline': { type: 'boolean' } },
}).values['update-baseline'];

// complexity at 0 makes ESLint report every function with its score. The ESLint API does not apply
// eslint-suppressions.json, so no function is hidden by the recorded lint debt.
const eslint = new ESLint({
  overrideConfig: { rules: { complexity: ['error', 0] } },
  ruleFilter: ({ ruleId }) => ruleId === 'complexity',
});
const results = await eslint.lintFiles(['src']);
const coverage = JSON.parse(readFileSync(COVERAGE, 'utf8'));
const scores = scoreFunctions(results, coverage, process.cwd());
// Named in the summary so that a path ESLint and Istanbul spell differently shows up instead of passing.
const skipped = results
  .filter(
    (result) => result.messages.length > 0 && !(result.filePath in coverage),
  )
  .map((result) => relative(process.cwd(), result.filePath));

const recorded = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8')).crap
  : undefined;
const baseline = recorded ?? (update ? improvedBaseline(scores) : {});
const problems = violations(scores, baseline);
if (update && problems.length === 0) {
  const next = improvedBaseline(scores, baseline);
  const sorted = Object.fromEntries(
    Object.keys(next)
      .sort()
      .map((key) => [key, next[key]]),
  );
  writeFileSync(BASELINE, `${JSON.stringify({ crap: sorted }, null, 2)}\n`);
}

for (const problem of problems) console.error(problem);
if (skipped.length > 0)
  process.stdout.write(
    `Not in the coverage report, not scored: ${skipped.join(', ')}\n`,
  );
process.stdout.write(
  `${scores.length} function(s) scored, ${problems.length} violation(s)\n`,
);
process.exitCode = problems.length === 0 ? 0 : 1;
