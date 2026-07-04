/**
 * Type definitions for literature note update operations (batch and single).
 * See {@link BatchNoteOrchestrator} for the runtime implementation.
 *
 * The review port (`NoteReviewItem`, `ReviewDecision`, `IUpdateReviewPresenter`)
 * lives in core (`../../core`) so the UI and notes layers share it without
 * depending on each other; it is re-exported here for convenience.
 */

import type { NoteUpdateMode, UpdateConfirmationMode } from '../../core';

export type {
  NoteReviewItem,
  ReviewDecision,
  IUpdateReviewPresenter,
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

/** Outcome of a single batch update run. */
export interface BatchUpdateResult {
  /** Citekeys whose notes were written (including reviewed ones). */
  updated: string[];

  /** Citekeys skipped: no existing note found, or already up to date. */
  skipped: string[];

  /**
   * Citekeys whose changes were NOT applied because conflicts were left
   * unresolved (confirmation 'never', no presenter, or the user chose to skip).
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
