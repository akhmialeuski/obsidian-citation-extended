import type { DiffHunk } from '../core';

/**
 * Renders a line diff (from `lineDiff` in core) as a `pre` of prefixed lines
 * with folded context, shared by every dialog that previews a change before
 * writing it. Styled by the `citation-review-*` and `citation-diff-line` rules.
 */

/** Cap on rendered diff lines so huge notes don't freeze the modal. */
const MAX_DIFF_LINES = 400;
/** Unchanged-context lines shown around each changed region. */
const CONTEXT_LINES = 2;

/**
 * Render the diff hunks with context folding. Long diffs are capped at
 * {@link MAX_DIFF_LINES} with an explicit "show more" control — the hidden
 * tail may be exactly what a destructive resolution rewrites, so the user
 * must be able to see all of it before clicking a button.
 */
export function renderLineDiff(
  container: HTMLElement,
  hunks: DiffHunk[],
): void {
  const pre = container.createEl('pre', { cls: 'citation-review-pre' });

  // Flatten first so the tail can be rendered on demand.
  const all: Array<{ text: string; cls: string }> = [];
  const push = (text: string, cls: string) => all.push({ text, cls });

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    if (hunk.kind === 'same') {
      // Fold long unchanged runs down to a little context.
      const lines = hunk.lines;
      const isFirst = i === 0;
      const isLast = i === hunks.length - 1;
      const head = isFirst ? 0 : Math.min(CONTEXT_LINES, lines.length);
      const tail = isLast ? 0 : Math.min(CONTEXT_LINES, lines.length - head);
      for (let j = 0; j < head; j++) push(`  ${lines[j]}`, 'is-context');
      if (lines.length > head + tail) {
        push(`  … ${lines.length - head - tail} unchanged lines …`, 'is-fold');
      }
      for (let j = lines.length - tail; j < lines.length; j++) {
        push(`  ${lines[j]}`, 'is-context');
      }
      continue;
    }
    for (const line of hunk.lines) {
      if (hunk.kind === 'removed') push(`- ${line}`, 'is-removed');
      else push(`+ ${line}`, 'is-added');
    }
  }

  const renderLines = (from: number, to: number) => {
    for (let i = from; i < Math.min(to, all.length); i++) {
      pre.createDiv({
        cls: `citation-diff-line ${all[i].cls}`,
        text: all[i].text,
      });
    }
  };

  renderLines(0, MAX_DIFF_LINES);
  if (all.length > MAX_DIFF_LINES) {
    const expand = pre.createDiv({
      cls: 'citation-diff-line is-fold citation-diff-expand',
      text: `  … ${all.length - MAX_DIFF_LINES} more lines — click to show …`,
    });
    expand.addEventListener('click', () => {
      expand.remove();
      renderLines(MAX_DIFF_LINES, all.length);
    });
  }
}
