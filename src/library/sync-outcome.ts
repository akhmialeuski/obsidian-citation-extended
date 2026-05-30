import { Library } from '../core';
import { LibraryState, LoadingStatus } from './library-state';

/**
 * Classification of a manual sync attempt, derived from the post-load
 * library state. Used by the Readwise settings card to report the real
 * outcome instead of always claiming success.
 */
export enum SyncOutcomeKind {
  /** Load failed entirely (no library produced) or ended in the Error state. */
  Failure = 'failure',
  /** Load succeeded but some entries/sources reported non-fatal errors. */
  SuccessWithWarnings = 'success-with-warnings',
  /** Load succeeded with no warnings. */
  Success = 'success',
}

/** Result of {@link classifySyncOutcome}: what to tell the user. */
export interface SyncOutcome {
  kind: SyncOutcomeKind;
  /** Human-readable summary suitable for a Notice. */
  message: string;
  /** Non-fatal warnings (parse/source errors) worth surfacing, if any. */
  warnings: string[];
}

/**
 * Classify the outcome of a `libraryService.load()` call for UI reporting.
 *
 * `load()` never throws — on failure it returns `null` and sets the store to
 * the Error state — so the only reliable signals are the returned value and
 * the resulting {@link LibraryState}. This pure function maps those signals to
 * one of three outcomes so callers (e.g. the "Sync now" button) can avoid
 * reporting false success and avoid persisting a misleading last-sync date.
 *
 * Note: `state.parseErrors` is the library-wide aggregate across ALL databases,
 * not just Readwise. The warning text is therefore phrased generically ("across
 * all sources") rather than implying the warnings originate from Readwise.
 *
 * @param state   Library state captured immediately after `load()` resolved.
 * @param result  The value returned by `load()` (`Library` on success, `null`
 *                on failure/abort/no-configured-databases).
 */
export function classifySyncOutcome(
  state: LibraryState,
  result: Library | null,
): SyncOutcome {
  if (result === null || state.status === LoadingStatus.Error) {
    // "Sync now" reloads ALL databases, so a failure may originate from a
    // non-Readwise source — phrase it source-agnostically.
    return {
      kind: SyncOutcomeKind.Failure,
      message: state.error?.message
        ? `Library reload failed: ${state.error.message}`
        : 'Library reload failed.',
      warnings: state.parseErrors,
    };
  }

  if (state.parseErrors.length > 0) {
    return {
      kind: SyncOutcomeKind.SuccessWithWarnings,
      message: `Synced with ${state.parseErrors.length} warning(s) across all sources.`,
      warnings: state.parseErrors,
    };
  }

  return {
    kind: SyncOutcomeKind.Success,
    message: 'Readwise sync complete.',
    warnings: [],
  };
}
