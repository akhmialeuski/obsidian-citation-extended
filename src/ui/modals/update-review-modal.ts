import { App, Modal, Setting } from 'obsidian';
import type { DiffHunk, NoteReviewItem, ReviewDecision } from '../../core';

/** Cap on rendered diff lines so huge notes don't freeze the modal. */
const MAX_DIFF_LINES = 400;
/** Unchanged-context lines shown around each changed region. */
const CONTEXT_LINES = 2;

/**
 * Review dialog shown before a note update is written: renders the line diff
 * (current note → proposed content) for each resolution the user can pick, so
 * whatever button they click was previewed. Resolves with
 * {@link ReviewDecision}; closing the dialog without choosing counts as "skip".
 */
export class UpdateReviewModal extends Modal {
  private decision: ReviewDecision = 'skip';
  private resolved = false;

  constructor(
    app: App,
    private readonly item: NoteReviewItem,
    private readonly remaining: number,
    private readonly resolve: (decision: ReviewDecision) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('citation-update-review');

    this.titleEl.setText(`Update literature note — ${this.item.citekey}`);
    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: this.item.filePath,
    });

    const hasConflicts = this.item.conflictCount > 0;
    if (hasConflicts) {
      contentEl.createEl('p', {
        cls: 'citation-review-conflicts',
        text:
          `${this.item.conflictCount} conflict${
            this.item.conflictCount === 1 ? '' : 's'
          }: ${this.item.conflictIds.join(', ')} — ` +
          'both you and the library changed these. "Apply" keeps your ' +
          'version; "Use library version" takes the fresh data.',
      });
    }

    // Preview the diff of the DEFAULT resolution ("Apply" / keep-my-edits).
    if (hasConflicts) {
      contentEl.createEl('p', {
        cls: 'citation-review-heading',
        text: 'Apply (keep your edits):',
      });
    }
    this.renderDiff(
      contentEl.createDiv('citation-review-diff'),
      this.item.hunks,
    );

    // When there are conflicts, also preview what "Use library version" writes
    // — otherwise that button would apply content the user never saw.
    if (hasConflicts && this.item.hunksTakeTheirs) {
      contentEl.createEl('p', {
        cls: 'citation-review-heading',
        text: 'Use library version:',
      });
      this.renderDiff(
        contentEl.createDiv('citation-review-diff'),
        this.item.hunksTakeTheirs,
      );
    }

    const buttons = new Setting(contentEl);
    buttons.addButton((b) =>
      b
        .setButtonText('Apply')
        .setCta()
        .onClick(() => this.finish('apply')),
    );
    if (hasConflicts) {
      buttons.addButton((b) =>
        b
          .setButtonText('Use library version')
          .onClick(() => this.finish('take-theirs')),
      );
    }
    buttons.addButton((b) =>
      b.setButtonText('Skip').onClick(() => this.finish('skip')),
    );
    if (this.remaining > 0) {
      const bulk = new Setting(contentEl).setDesc(
        `${this.remaining} more note${this.remaining === 1 ? '' : 's'} waiting for review.`,
      );
      bulk.addButton((b) =>
        b.setButtonText('Apply all').onClick(() => this.finish('apply-all')),
      );
      bulk.addButton((b) =>
        b.setButtonText('Skip all').onClick(() => this.finish('skip-all')),
      );
    }
  }

  /** Render the diff hunks with context folding and a hard line cap. */
  private renderDiff(container: HTMLElement, hunks: DiffHunk[]): void {
    const pre = container.createEl('pre', { cls: 'citation-review-pre' });
    let printed = 0;

    const print = (text: string, cls: string) => {
      if (printed >= MAX_DIFF_LINES) return;
      printed++;
      pre.createDiv({ cls: `citation-diff-line ${cls}`, text });
    };

    for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i];
      if (hunk.kind === 'same') {
        // Fold long unchanged runs down to a little context.
        const lines = hunk.lines;
        const isFirst = i === 0;
        const isLast = i === hunks.length - 1;
        const head = isFirst ? 0 : Math.min(CONTEXT_LINES, lines.length);
        const tail = isLast ? 0 : Math.min(CONTEXT_LINES, lines.length - head);
        for (let j = 0; j < head; j++) print(`  ${lines[j]}`, 'is-context');
        if (lines.length > head + tail) {
          print(
            `  … ${lines.length - head - tail} unchanged lines …`,
            'is-fold',
          );
        }
        for (let j = lines.length - tail; j < lines.length; j++) {
          print(`  ${lines[j]}`, 'is-context');
        }
        continue;
      }
      for (const line of hunk.lines) {
        if (hunk.kind === 'removed') print(`- ${line}`, 'is-removed');
        else print(`+ ${line}`, 'is-added');
      }
    }
    if (printed >= MAX_DIFF_LINES) {
      pre.createDiv({
        cls: 'citation-diff-line is-fold',
        text: '  … diff truncated …',
      });
    }
  }

  private finish(decision: ReviewDecision): void {
    this.decision = decision;
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(this.decision);
    }
  }
}

/**
 * Present review items sequentially with Obsidian modals.
 * Implements the orchestrator's presenter contract.
 */
export class ModalUpdateReviewPresenter {
  constructor(private readonly app: App) {}

  review(item: NoteReviewItem, remaining: number): Promise<ReviewDecision> {
    return new Promise((resolve) => {
      new UpdateReviewModal(this.app, item, remaining, resolve).open();
    });
  }
}
