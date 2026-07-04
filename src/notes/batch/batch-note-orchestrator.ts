import type {
  ILibraryService,
  INoteService,
  ITemplateService,
} from '../../container';
import type { IVaultAccess, IVaultFile } from '../../platform/platform-adapter';
import { lineDiff, planNoteSync } from '../../core';
import type { NoteSyncPlan, NoteUpdateMode } from '../../core';
import type { IBaselineStore } from '../baseline-store';
import type {
  IBatchNoteOrchestrator,
  IUpdateReviewPresenter,
  BatchUpdateRequest,
  BatchUpdateResult,
  BatchUpdateProgress,
  NoteReviewItem,
  ReviewDecision,
} from './batch-update.types';

/** A note whose write needs a user decision, reviewed after the scan. */
interface QueuedNote {
  citekey: string;
  file: IVaultFile;
  rendered: string;
  mode: NoteUpdateMode;
  plan: NoteSyncPlan;
  /** Note content captured at scan time (for staleness detection). */
  current: string;
}

/**
 * Orchestrates literature note updates (batch and single-note).
 *
 * For each requested citekey:
 * 1. Looks up the entry and the existing note file.
 * 2. Renders the template and builds a {@link NoteSyncPlan}:
 *    - `sync`        — plugin-owned callout blocks + frontmatter keys merged
 *                      three-way against the baseline store; everything else
 *                      in the note is user-owned and untouched.
 *    - `frontmatter` — same, but body blocks are left alone entirely.
 *    - `overwrite`   — the fresh render replaces the note.
 * 3. Applies the plan directly, or routes it through the review presenter
 *    (diff dialog) according to the confirmation policy.
 * 4. Persists the new baseline; the whole batch flushes the store once.
 *
 * Before writing a reviewed note, the file is re-read and re-planned so edits
 * made during the (user-paced) review are not silently clobbered.
 */
export class BatchNoteOrchestrator implements IBatchNoteOrchestrator {
  constructor(
    private readonly libraryService: ILibraryService,
    private readonly noteService: INoteService,
    private readonly templateService: ITemplateService,
    private readonly vault: IVaultAccess,
    private readonly baselines: IBaselineStore,
    private readonly presenter?: IUpdateReviewPresenter,
  ) {}

  preview(request: BatchUpdateRequest): Promise<BatchUpdateResult> {
    return this.run(request, undefined, true);
  }

  execute(
    request: BatchUpdateRequest,
    onProgress?: (progress: BatchUpdateProgress) => void,
  ): Promise<BatchUpdateResult> {
    return this.run(request, onProgress, request.dryRun);
  }

  private async run(
    request: BatchUpdateRequest,
    onProgress: ((progress: BatchUpdateProgress) => void) | undefined,
    dryRun: boolean,
  ): Promise<BatchUpdateResult> {
    const library = this.libraryService.library;
    if (!library) {
      return {
        updated: [],
        skipped: [],
        conflicts: [],
        errors: [],
        libraryNotReady: true,
      };
    }

    const allCitekeys = Object.keys(library.entries);
    const citekeys =
      request.citekeys.length === 1 && request.citekeys[0] === '*'
        ? allCitekeys
        : request.citekeys;

    const result: BatchUpdateResult = {
      updated: [],
      skipped: [],
      conflicts: [],
      errors: [],
    };
    const reviewQueue: QueuedNote[] = [];
    let wrote = false;

    for (let i = 0; i < citekeys.length; i++) {
      const citekey = citekeys[i];

      onProgress?.({
        current: i + 1,
        total: citekeys.length,
        currentCitekey: citekey,
      });

      const entry = library.entries[citekey];
      if (!entry) {
        result.skipped.push(citekey);
        continue;
      }

      const file = this.noteService.findExistingLiteratureNoteFile(
        citekey,
        library,
      );
      if (!file) {
        result.skipped.push(citekey);
        continue;
      }

      try {
        const variables = this.templateService.getTemplateVariables(entry);
        const contentResult = this.templateService.render(
          request.templateStr,
          variables,
        );
        if (!contentResult.ok) {
          result.errors.push({ citekey, error: contentResult.error.message });
          continue;
        }

        const rendered = contentResult.value;
        const current = await this.vault.read(file);
        const plan = await this.buildPlan(
          request.mode,
          citekey,
          rendered,
          current,
        );

        if (!plan.changed && plan.conflicts.length === 0) {
          result.skipped.push(citekey);
          continue;
        }

        const needsReview =
          plan.conflicts.length > 0 || request.confirmation === 'always';

        // Direct write path: no review needed, or review is impossible
        // (dry-run / 'never' / no presenter). We only write when there is a
        // clean, applicable change; conflicts without a decision are reported.
        if (
          !needsReview ||
          dryRun ||
          request.confirmation === 'never' ||
          !this.presenter
        ) {
          if (plan.conflicts.length > 0) {
            // Cannot resolve without the user — leave the note untouched.
            result.conflicts.push({
              citekey,
              conflictIds: plan.conflicts.map((c) => c.id),
            });
            continue;
          }
          if (dryRun) {
            result.updated.push(citekey);
            continue;
          }
          await this.write(citekey, file, plan.content, plan);
          wrote = true;
          result.updated.push(citekey);
          continue;
        }

        reviewQueue.push({
          citekey,
          file,
          rendered,
          mode: request.mode,
          plan,
          current,
        });
      } catch (e) {
        result.errors.push({
          citekey,
          error: (e as Error).message ?? String(e),
        });
      }
    }

    if (reviewQueue.length > 0 && this.presenter && !dryRun) {
      wrote = (await this.reviewAndApply(reviewQueue, result)) || wrote;
    }

    if (wrote) await this.baselines.flush();

    return result;
  }

  /** Build the sync plan for the requested mode. */
  private async buildPlan(
    mode: NoteUpdateMode,
    citekey: string,
    rendered: string,
    current: string,
  ): Promise<NoteSyncPlan> {
    return planNoteSync({
      rendered,
      current,
      baseline: mode === 'overwrite' ? null : await this.baselines.get(citekey),
      mode,
    });
  }

  /**
   * Sequentially present queued notes and apply the decisions. Each note is
   * re-read and re-planned immediately before writing so edits made during the
   * review are respected. Returns whether anything was written.
   */
  private async reviewAndApply(
    queue: QueuedNote[],
    result: BatchUpdateResult,
  ): Promise<boolean> {
    let blanket: 'apply' | 'skip' | null = null;
    let wrote = false;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      let decision: ReviewDecision;

      if (blanket) {
        decision = blanket;
      } else {
        const reviewItem: NoteReviewItem = {
          citekey: item.citekey,
          filePath: item.file.path,
          hunks: lineDiff(item.current, item.plan.content),
          hunksTakeTheirs:
            item.plan.conflicts.length > 0
              ? lineDiff(item.current, item.plan.contentTakeTheirs)
              : undefined,
          conflictCount: item.plan.conflicts.length,
          conflictIds: item.plan.conflicts.map((c) => c.id),
        };
        decision = await this.presenter!.review(
          reviewItem,
          queue.length - i - 1,
        );
        if (decision === 'apply-all') {
          blanket = 'apply';
          decision = 'apply';
        } else if (decision === 'skip-all') {
          blanket = 'skip';
          decision = 'skip';
        }
      }

      if (decision === 'skip') {
        result.conflicts.push({
          citekey: item.citekey,
          conflictIds: item.plan.conflicts.map((c) => c.id),
        });
        continue;
      }

      try {
        if (await this.applyReviewed(item, decision, result)) wrote = true;
      } catch (e) {
        result.errors.push({
          citekey: item.citekey,
          error: (e as Error).message ?? String(e),
        });
      }
    }
    return wrote;
  }

  /**
   * Re-read the note, re-plan against the fresh content, and write the chosen
   * resolution. If the note changed during review in a way that reintroduces
   * conflicts, skip it and report rather than clobber the new edits.
   */
  private async applyReviewed(
    item: QueuedNote,
    decision: 'apply' | 'take-theirs',
    result: BatchUpdateResult,
  ): Promise<boolean> {
    const fresh = await this.vault.read(item.file);
    let plan = item.plan;
    if (fresh !== item.current) {
      // The file moved under us during review — re-plan against reality.
      plan = await this.buildPlan(
        item.mode,
        item.citekey,
        item.rendered,
        fresh,
      );
      if (!plan.changed && plan.conflicts.length === 0) {
        result.skipped.push(item.citekey);
        return false;
      }
      if (plan.conflicts.length > 0) {
        // New conflicts appeared since the reviewed diff — don't apply a stale
        // decision to content the user never saw.
        result.conflicts.push({
          citekey: item.citekey,
          conflictIds: plan.conflicts.map((c) => c.id),
        });
        return false;
      }
    }

    const content =
      decision === 'take-theirs' ? plan.contentTakeTheirs : plan.content;
    await this.write(item.citekey, item.file, content, plan);
    result.updated.push(item.citekey);
    return true;
  }

  /** Write the resolved content and record the new baseline (not yet flushed). */
  private async write(
    citekey: string,
    file: IVaultFile,
    content: string,
    plan: NoteSyncPlan,
  ): Promise<void> {
    await this.vault.modify(file, content);
    await this.baselines.set(citekey, plan.baseline);
  }
}
