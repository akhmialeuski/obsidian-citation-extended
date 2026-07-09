/**
 * Thin line-based wrappers around `node-diff3` used by the note sync planner:
 * a three-way text merge (git-style) and a two-way diff for the review UI.
 */

import { diff3Merge, diffComm } from 'node-diff3';

/** Result of a three-way merge attempt. */
export interface Merge3Result {
  /** True when the merge completed without overlapping edits. */
  ok: boolean;
  /** Merged text (only meaningful when `ok`). */
  merged: string;
}

/**
 * Three-way merge: `base` is the last rendered snapshot, `ours` is the note
 * as it is now (user edits), `theirs` is the fresh render (library changes).
 * Non-overlapping edits from both sides are combined; overlapping edits
 * report a conflict instead of guessing.
 */
export function mergeText(
  base: string,
  ours: string,
  theirs: string,
): Merge3Result {
  const regions = diff3Merge(
    ours.split('\n'),
    base.split('\n'),
    theirs.split('\n'),
    { excludeFalseConflicts: true },
  );

  const lines: string[] = [];
  let ok = true;
  for (const region of regions) {
    if (region.ok) {
      lines.push(...region.ok);
    } else if (region.conflict) {
      ok = false;
      // Keep "ours" for the conflicting region so the merged text is still
      // usable as the safe default (the caller surfaces the conflict).
      lines.push(...region.conflict.a);
    }
  }
  return { ok, merged: lines.join('\n') };
}

/** One run of identical or differing lines in a two-way diff. */
export interface DiffHunk {
  kind: 'same' | 'removed' | 'added';
  lines: string[];
}

/**
 * Two-way line diff (current → proposed) for display in the review modal.
 * Differing regions expand into a `removed` hunk followed by an `added` hunk.
 */
export function lineDiff(current: string, proposed: string): DiffHunk[] {
  const chunks = diffComm(current.split('\n'), proposed.split('\n'));
  const hunks: DiffHunk[] = [];
  for (const chunk of chunks) {
    if (chunk.common) {
      hunks.push({ kind: 'same', lines: chunk.common });
      continue;
    }
    if (chunk.buffer1 && chunk.buffer1.length > 0) {
      hunks.push({ kind: 'removed', lines: chunk.buffer1 });
    }
    if (chunk.buffer2 && chunk.buffer2.length > 0) {
      hunks.push({ kind: 'added', lines: chunk.buffer2 });
    }
  }
  return hunks;
}
