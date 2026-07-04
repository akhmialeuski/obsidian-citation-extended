/**
 * The review port: the contract between the note-update orchestrator (which
 * produces diffs to confirm) and whatever UI presents them. Lives in core so
 * neither the notes layer nor the UI layer depends on the other — both depend
 * on this shared abstraction.
 */

import type { DiffHunk } from './merge3';

/** A note queued for interactive review before writing. */
export interface NoteReviewItem {
  citekey: string;
  filePath: string;
  /** Line diff current → the keep-my-edits ("Apply") resolution. */
  hunks: DiffHunk[];
  /**
   * Line diff current → the take-the-library-version resolution. Present only
   * when it differs from `hunks` (i.e. there are conflicts), so the modal can
   * preview exactly what each button writes.
   */
  hunksTakeTheirs?: DiffHunk[];
  /** Number of conflicting units (0 = clean change under 'always' mode). */
  conflictCount: number;
  /** Conflicting block names / frontmatter keys, for display. */
  conflictIds: string[];
}

/** What the user decided for a reviewed note. */
export type ReviewDecision =
  | 'apply' // write the safe (keep-my-edits) resolution
  | 'take-theirs' // write the library-wins resolution
  | 'skip' // leave the note untouched
  | 'apply-all' // apply, and stop asking for the remaining notes
  | 'skip-all'; // skip, and stop asking for the remaining notes

/** UI hook that presents a review item and resolves with the decision. */
export interface IUpdateReviewPresenter {
  review(item: NoteReviewItem, remaining: number): Promise<ReviewDecision>;
}
