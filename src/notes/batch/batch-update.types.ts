/**
 * Type definitions for batch literature note update operations.
 *
 * These interfaces prepare the extension point for a future feature
 * that allows updating all existing literature notes when the content
 * template changes.  No runtime implementation exists yet — see
 * {@link BatchNoteOrchestrator} for the stub.
 */

/** Describes which notes to update and how. */
export interface BatchUpdateRequest {
  /** Citekeys of notes to update. Use `['*']` for all existing notes. */
  citekeys: string[];

  /** The template string to render for each note's content. */
  templateStr: string;

  /** When true, compute changes without writing files. */
  dryRun: boolean;
}

/** Outcome of a single batch update run. */
export interface BatchUpdateResult {
  /** Citekeys whose notes were successfully updated. */
  updated: string[];

  /** Citekeys for which no existing note was found. */
  skipped: string[];

  /** Citekeys that encountered errors during update. */
  errors: Array<{ citekey: string; error: string }>;
}

/** Progress callback payload emitted during execution. */
export interface BatchUpdateProgress {
  current: number;
  total: number;
  currentCitekey: string;
}

/** Orchestrates bulk note updates with progress and dry-run support. */
export interface IBatchNoteOrchestrator {
  /** Compute a preview of what would change without writing. */
  preview(request: BatchUpdateRequest): Promise<BatchUpdateResult>;

  /** Execute the batch update, optionally reporting progress. */
  execute(
    request: BatchUpdateRequest,
    onProgress?: (progress: BatchUpdateProgress) => void,
  ): Promise<BatchUpdateResult>;
}
