/**
 * Jest config for the performance benchmark suite (`npm run bench`).
 *
 * Benchmarks are intentionally excluded from the default `npm test` run:
 * they use `*.bench.ts` filenames, which the main config's `*.spec.ts`
 * testMatch never picks up. This config inverts that.
 */
module.exports = {
  roots: ['<rootDir>/tests/benchmarks', '<rootDir>/src'],
  testMatch: ['<rootDir>/tests/benchmarks/**/*.bench.ts'],
  moduleNameMapper: {
    'src/(.*)': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['js', 'ts', 'd.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Benchmarks measure wall-clock time: run files serially so parallel
  // workers don't steal CPU from each other and skew the numbers.
  maxWorkers: 1,
  verbose: true,
};
