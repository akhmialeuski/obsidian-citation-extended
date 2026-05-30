import {
  classifySyncOutcome,
  SyncOutcomeKind,
} from '../../src/library/sync-outcome';
import { LibraryState, LoadingStatus } from '../../src/library/library-state';
import { Library } from '../../src/core';

jest.mock('obsidian', () => ({}), { virtual: true });

function state(overrides: Partial<LibraryState> = {}): LibraryState {
  return {
    status: LoadingStatus.Success,
    parseErrors: [],
    ...overrides,
  };
}

const aLibrary = new Library({});

describe('classifySyncOutcome', () => {
  describe('Failure', () => {
    it('classifies a null result as failure even when status is Success', () => {
      const outcome = classifySyncOutcome(
        state({ status: LoadingStatus.Success }),
        null,
      );

      expect(outcome.kind).toBe(SyncOutcomeKind.Failure);
      expect(outcome.message).toBe('Readwise sync failed.');
    });

    it('classifies Error status as failure and includes the error message', () => {
      const outcome = classifySyncOutcome(
        state({
          status: LoadingStatus.Error,
          error: new Error('network down'),
          parseErrors: ['Unable to load citations: network down.'],
        }),
        null,
      );

      expect(outcome.kind).toBe(SyncOutcomeKind.Failure);
      expect(outcome.message).toBe('Readwise sync failed: network down');
      expect(outcome.warnings).toEqual([
        'Unable to load citations: network down.',
      ]);
    });

    it('falls back to a generic message when no error is attached', () => {
      const outcome = classifySyncOutcome(
        state({ status: LoadingStatus.Error }),
        null,
      );

      expect(outcome.kind).toBe(SyncOutcomeKind.Failure);
      expect(outcome.message).toBe('Readwise sync failed.');
    });
  });

  describe('SuccessWithWarnings', () => {
    it('classifies a non-null result with parse errors as success-with-warnings', () => {
      const outcome = classifySyncOutcome(
        state({
          status: LoadingStatus.Success,
          parseErrors: ['Readwise API unavailable (using cache): timeout'],
        }),
        aLibrary,
      );

      expect(outcome.kind).toBe(SyncOutcomeKind.SuccessWithWarnings);
      expect(outcome.message).toBe(
        'Synced with 1 warning(s) across all sources.',
      );
      expect(outcome.warnings).toHaveLength(1);
    });
  });

  describe('Success', () => {
    it('classifies a clean non-null result as success', () => {
      const outcome = classifySyncOutcome(
        state({ status: LoadingStatus.Success, parseErrors: [] }),
        aLibrary,
      );

      expect(outcome.kind).toBe(SyncOutcomeKind.Success);
      expect(outcome.message).toBe('Readwise sync complete.');
      expect(outcome.warnings).toEqual([]);
    });
  });
});
