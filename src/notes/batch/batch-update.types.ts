/**
 * Type definitions for literature note update operations (batch and single).
 * See {@link BatchNoteOrchestrator} for the runtime implementation.
 */

import type {
  DiffHunk,
  NoteUpdateMode,
  UpdateConfirmationMode,
} from '../../core';

/** Describes which notes to update and how. */
export interface BatchUpdateRequest {
  /** Citekeys of notes to update. Use `['*']` for all existing notes. */
  citekeys: string[];

  /** The template string to render for each note's content. */
  templateStr: string;

  /** When true, compute changes without writing files. */
  dryRun: boolean;

  /**
   * How existing notes are treated:
   * - `sync`        — plugin-owned callout blocks and frontmatter keys are
   *                   merged three-way against the stored baseline; all other
   *                   content is user-owned and never touched.
   * - `frontmatter` — only frontmatter keys are refreshed; body untouched.
   * - `overwrite`   — replace the whole note with the fresh render.
   */
  mode: NoteUpdateMode;

  /** When the review dialog is required before writing. */
  confirmation: UpdateConfirmationMode;
}

/** A note queued for interactive review before writing. */
export interface NoteReviewItem {
  citekey: string;
  filePath: string;
  /** Line diff current → proposed content (safe resolution). */
  hunks: DiffHunk[];
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

/** Outcome of a single batch update run. */
export interface BatchUpdateResult {
  /** Citekeys whose notes were written (including reviewed ones). */
  updated: string[];

  /** Citekeys skipped: no existing note found, or already up to date. */
  skipped: string[];

  /**
   * Citekeys whose changes were NOT applied because conflicts were left
   * unresolved (confirmation 'never', or the user chose to skip).
   */
  conflicts: Array<{ citekey: string; conflictIds: string[] }>;

  /** Citekeys that encountered errors during update. */
  errors: Array<{ citekey: string; error: string }>;

  /** True when the library was not loaded at the time of the request. */
  libraryNotReady?: boolean;
}

/** Progress callback payload emitted during execution. */
export interface BatchUpdateProgress {
  current: number;
  total: number;
  currentCitekey: string;
}

/** Orchestrates note updates with review, progress, and dry-run support. */
export interface IBatchNoteOrchestrator {
  /** Compute a preview of what would change without writing. */
  preview(request: BatchUpdateRequest): Promise<BatchUpdateResult>;

  /** Execute the update, optionally reporting progress. */
  execute(
    request: BatchUpdateRequest,
    onProgress?: (progress: BatchUpdateProgress) => void,
  ): Promise<BatchUpdateResult>;
}
