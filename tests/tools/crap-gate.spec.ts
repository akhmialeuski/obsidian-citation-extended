import type { ESLint } from 'eslint';
import {
  CRAP_THRESHOLD,
  FileCoverage,
  improvedBaseline,
  Score,
  scoreFunctions,
  violations,
} from '../../tools/crap-gate';

const ROOT = '/repo';
const FILE = '/repo/src/a.ts';

interface Message {
  message: string;
  line: number;
  endLine: number;
  endColumn: number;
  ruleId?: string;
}

function lint(messages: Message[], filePath = FILE): ESLint.LintResult[] {
  return [
    {
      filePath,
      messages: messages.map((m) => ({
        ruleId: 'complexity',
        column: 1,
        severity: 2,
        ...m,
      })),
    } as unknown as ESLint.LintResult,
  ];
}

const at = (line: number, column: number) => ({ line, column });
const range = (from: [number, number], to: [number, number]) => ({
  start: at(...from),
  end: at(...to),
});

function coverage(file: Partial<FileCoverage>): Record<string, FileCoverage> {
  return {
    [FILE]: {
      fnMap: {},
      f: {},
      statementMap: {},
      s: {},
      branchMap: {},
      b: {},
      ...file,
    },
  };
}

function score(key: string, crap: number): Score {
  return {
    key,
    path: 'src/a.ts',
    name: key,
    line: 1,
    complexity: 9,
    coverage: 0,
    crap,
  };
}

describe('scoreFunctions', () => {
  it('matches a function whose wrapped parameters move its body below the head', () => {
    // function attachmentsByParent(
    //   attachments: Item[],
    // ): Map<string, Info[]> {
    const scores = scoreFunctions(
      lint([
        {
          message: "Function 'attachmentsByParent' has a complexity of 4.",
          line: 1,
          endLine: 1,
          endColumn: 29,
        },
      ]),
      coverage({
        fnMap: {
          '0': {
            name: 'attachmentsByParent',
            decl: range([1, 9], [1, 28]),
            loc: range([3, 22], [6, 1]),
          },
        },
        f: { '0': 3 },
        statementMap: {
          '0': range([4, 2], [4, 20]),
          '1': range([5, 2], [5, 20]),
        },
        s: { '0': 3, '1': 3 },
      }),
      ROOT,
    );

    expect(scores).toEqual([
      {
        key: 'src/a.ts::attachmentsByParent',
        path: 'src/a.ts',
        name: 'attachmentsByParent',
        line: 1,
        complexity: 4,
        coverage: 1,
        crap: 4,
      },
    ]);
  });

  it('picks the innermost function holding the head of a nested arrow', () => {
    const scores = scoreFunctions(
      lint([
        {
          message: 'Arrow function has a complexity of 2.',
          line: 2,
          endLine: 2,
          endColumn: 24,
        },
      ]),
      coverage({
        fnMap: {
          '0': {
            name: 'outer',
            decl: range([1, 9], [1, 14]),
            loc: range([1, 17], [4, 1]),
          },
          '1': {
            name: '(anonymous_1)',
            decl: range([2, 14], [2, 23]),
            loc: range([2, 23], [3, 3]),
          },
        },
        f: { '0': 1, '1': 0 },
      }),
      ROOT,
    );

    expect(scores[0]).toMatchObject({
      name: '(anonymous_1)',
      coverage: 0,
      crap: 6,
    });
  });

  it('takes the lower of statement and branch coverage', () => {
    const scores = scoreFunctions(
      lint([
        {
          message: "Method 'run' has a complexity of 3.",
          line: 1,
          endLine: 1,
          endColumn: 6,
        },
      ]),
      coverage({
        fnMap: {
          '0': {
            name: '(anonymous_0)',
            decl: range([1, 2], [1, 5]),
            loc: range([1, 8], [9, 3]),
          },
        },
        f: { '0': 1 },
        statementMap: {
          '0': range([2, 4], [2, 9]),
          '1': range([3, 4], [3, 9]),
        },
        s: { '0': 1, '1': 1 },
        branchMap: { '0': { loc: range([2, 4], [8, 5]) } },
        b: { '0': [1, 0, 0, 0] },
      }),
      ROOT,
    );

    expect(scores[0]).toMatchObject({ name: 'run', coverage: 0.25 });
    expect(scores[0].crap).toBeCloseTo(3 ** 2 * 0.75 ** 3 + 3, 4);
  });

  it('counts a function Istanbul does not know as uncovered and names it by line', () => {
    const scores = scoreFunctions(
      lint([
        {
          message: 'Arrow function has a complexity of 3.',
          line: 7,
          endLine: 7,
          endColumn: 12,
        },
      ]),
      coverage({}),
      ROOT,
    );

    expect(scores[0]).toMatchObject({
      key: 'src/a.ts::line 7',
      coverage: 0,
      crap: 12,
    });
  });

  // Jest's collectCoverageFrom leaves some files out on purpose, and scoring them as untested would fail
  // a function however well it is tested.
  it('skips a file the coverage report does not hold', () => {
    const scores = scoreFunctions(
      lint(
        [
          {
            message: 'Arrow function has a complexity of 3.',
            line: 7,
            endLine: 7,
            endColumn: 12,
          },
        ],
        '/repo/src/worker.ts',
      ),
      coverage({}),
      ROOT,
    );

    expect(scores).toEqual([]);
  });

  // ESLint counts the complexity of a function without its nested functions, so its coverage has to
  // leave them out too, or an untested callback fails the function that encloses it.
  it('leaves the statements and branches of a nested function out of the enclosing one', () => {
    // Six statements of outer on lines 2 to 7 ran, six of the nested arrow on lines 10 to 15 did not.
    const lines = [2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15];
    const ids = lines.map((_, i) => `${i}`);
    const scores = scoreFunctions(
      lint([
        {
          message: "Function 'outer' has a complexity of 6.",
          line: 1,
          endLine: 1,
          endColumn: 15,
        },
        {
          message: 'Arrow function has a complexity of 2.',
          line: 9,
          endLine: 9,
          endColumn: 26,
        },
      ]),
      coverage({
        fnMap: {
          '0': {
            name: 'outer',
            decl: range([1, 9], [1, 14]),
            loc: range([1, 30], [20, 1]),
          },
          '1': {
            name: '(anonymous_1)',
            decl: range([9, 20], [9, 25]),
            loc: range([9, 26], [16, 3]),
          },
        },
        f: { '0': 1, '1': 0 },
        statementMap: Object.fromEntries(
          ids.map((id, i) => [id, range([lines[i], 2], [lines[i], 10])]),
        ),
        s: Object.fromEntries(ids.map((id, i) => [id, lines[i] < 9 ? 1 : 0])),
        branchMap: { '0': { loc: range([11, 4], [13, 5]) } },
        b: { '0': [0, 0] },
      }),
      ROOT,
    );

    expect(scores.map((s) => [s.name, s.coverage, s.crap])).toEqual([
      ['outer', 1, 6],
      ['(anonymous_1)', 0, 6],
    ]);
  });

  it('skips class field initializers, static blocks and other rules', () => {
    const scores = scoreFunctions(
      lint([
        {
          message: 'Class field initializer has a complexity of 3.',
          line: 1,
          endLine: 1,
          endColumn: 9,
        },
        {
          message: 'Class static block has a complexity of 3.',
          line: 2,
          endLine: 2,
          endColumn: 9,
        },
        {
          message: 'Unexpected any.',
          line: 3,
          endLine: 3,
          endColumn: 9,
          ruleId: 'no-explicit-any',
        },
      ]),
      coverage({}),
      ROOT,
    );

    expect(scores).toEqual([]);
  });

  it('numbers a name repeated in one file', () => {
    const scores = scoreFunctions(
      lint([
        {
          message: "Method 'execute' has a complexity of 1.",
          line: 3,
          endLine: 3,
          endColumn: 10,
        },
        {
          message: "Method 'execute' has a complexity of 1.",
          line: 9,
          endLine: 9,
          endColumn: 10,
        },
      ]),
      coverage({}),
      ROOT,
    );

    expect(scores.map((s) => s.key)).toEqual([
      'src/a.ts::execute',
      'src/a.ts::execute#2',
    ]);
  });
});

describe('violations', () => {
  it('reports unrecorded and worsened functions over the threshold, worst first', () => {
    const scores = [
      score('new', 12),
      score('worse', 30),
      score('kept', 20),
      score('better', 9),
      score('fine', CRAP_THRESHOLD),
    ];

    const found = violations(scores, { worse: 25, kept: 20, better: 15 });

    expect(found).toEqual([
      'src/a.ts:1: worse CRAP 30.00 (complexity 9, coverage 0%), the limit is 8',
      'src/a.ts:1: new CRAP 12.00 (complexity 9, coverage 0%), the limit is 8',
    ]);
  });
});

describe('improvedBaseline', () => {
  it('records every function over the threshold when nothing is recorded yet', () => {
    expect(improvedBaseline([score('a', 12), score('b', 8)])).toEqual({
      a: 12,
    });
  });

  it('keeps only recorded functions still over the threshold, at their lower score', () => {
    const scores = [
      score('lower', 10),
      score('higher', 40),
      score('fixed', 5),
      score('new', 50),
    ];

    expect(
      improvedBaseline(scores, { lower: 20, higher: 30, fixed: 15, gone: 9 }),
    ).toEqual({
      lower: 10,
      higher: 30,
    });
  });
});
