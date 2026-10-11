import { App, Modal, Setting } from 'obsidian';
import type { NoteReviewItem, ReviewDecision } from '../../core';
import { renderLineDiff } from '../render-line-diff';

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

    const conflictCount = this.item.conflictIds.length;
    const hasConflicts = conflictCount > 0;
    // With conflicts the button label must say WHICH side it keeps — a bare
    // "Apply" reads as "apply the library changes", the opposite of what the
    // safe default does.
    const applyLabel = hasConflicts ? 'Apply (keep my edits)' : 'Apply';
    if (hasConflicts) {
      contentEl.createEl('p', {
        cls: 'citation-review-conflicts',
        text:
          `${conflictCount} conflict${
            conflictCount === 1 ? '' : 's'
          }: ${this.item.conflictIds.join(', ')} — ` +
          'both you and the library changed these. Both outcomes are ' +
          'previewed below: "Apply (keep my edits)" still applies the rest ' +
          'of the update but keeps YOUR version of the conflicted parts; ' +
          '"Use library version" replaces them with the library’s version.',
      });
    }

    // Preview the diff of the DEFAULT resolution ("Apply" / keep-my-edits).
    if (hasConflicts) {
      contentEl.createEl('p', {
        cls: 'citation-review-heading',
        text: 'Apply (keep my edits) — will write:',
      });
    }
    renderLineDiff(
      contentEl.createDiv('citation-review-diff'),
      this.item.hunks,
    );

    // When there are conflicts, also preview what "Use library version" writes
    // — otherwise that button would apply content the user never saw.
    if (hasConflicts && this.item.hunksTakeTheirs) {
      contentEl.createEl('p', {
        cls: 'citation-review-heading',
        text: 'Use library version — will write:',
      });
      renderLineDiff(
        contentEl.createDiv('citation-review-diff'),
        this.item.hunksTakeTheirs,
      );
    }

    const buttons = new Setting(contentEl);
    buttons.addButton((b) =>
      b
        .setButtonText(applyLabel)
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
      // "Apply all" applies the keep-my-edits resolution to every remaining
      // note (see the orchestrator's apply-all handling), so it must carry the
      // same clarification as the single-note button — a bare "Apply all"
      // reads as "accept all the library changes", the opposite of what it does.
      const applyAllLabel = hasConflicts
        ? 'Apply all (keep my edits)'
        : 'Apply all';
      bulk.addButton((b) =>
        b.setButtonText(applyAllLabel).onClick(() => this.finish('apply-all')),
      );
      bulk.addButton((b) =>
        b.setButtonText('Skip all').onClick(() => this.finish('skip-all')),
      );
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
