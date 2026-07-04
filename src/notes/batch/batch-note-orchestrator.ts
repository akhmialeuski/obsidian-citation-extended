import type {
  ILibraryService,
  INoteService,
  ITemplateService,
} from '../../container';
import type { IVaultAccess, IVaultFile } from '../../platform/platform-adapter';
import { lineDiff, planNoteSync } from '../../core';
import type { NoteSyncPlan } from '../../core';
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
 * 4. Persists the new baseline after every successful write.
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
    /** Notes whose write needs a user decision, reviewed after the scan. */
    const reviewQueue: Array<{
      citekey: string;
      file: IVaultFile;
      plan: NoteSyncPlan;
      current: string;
    }> = [];

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

        if (!needsReview) {
          if (!dryRun) {
            await this.write(citekey, file, plan.content, plan);
          }
          result.updated.push(citekey);
          continue;
        }

        if (dryRun || request.confirmation === 'never' || !this.presenter) {
          if (plan.conflicts.length > 0) {
            result.conflicts.push({
              citekey,
              conflictIds: plan.conflicts.map((c) => c.id),
            });
            // 'never' + conflicts: the safe resolution may still carry
            // non-conflicting updates, but writing silently would hide the
            // decision — leave the note untouched.
          } else {
            // dryRun/'always' without presenter: count as pending change.
            result.updated.push(citekey);
          }
          continue;
        }

        reviewQueue.push({ citekey, file, plan, current });
      } catch (e) {
        result.errors.push({
          citekey,
          error: (e as Error).message ?? String(e),
        });
      }
    }

    if (reviewQueue.length > 0 && this.presenter && !dryRun) {
      await this.reviewAndApply(reviewQueue, result);
    }

    return result;
  }

  /** Build the sync plan for the requested mode. */
  private async buildPlan(
    mode: BatchUpdateRequest['mode'],
    citekey: string,
    rendered: string,
    current: string,
  ): Promise<NoteSyncPlan> {
    switch (mode) {
      case 'overwrite': {
        // Wholesale replace; the plan is trivial and its baseline is simply
        // a parse of the fresh render (rendered vs itself → no conflicts).
        const plan = planNoteSync({
          rendered,
          current: rendered,
          baseline: null,
        });
        return {
          ...plan,
          changed: rendered !== current,
          content: rendered,
          contentTakeTheirs: rendered,
          conflicts: [],
        };
      }
      case 'frontmatter':
        return planNoteSync({
          rendered,
          current,
          baseline: await this.baselines.get(citekey),
          frontmatterOnly: true,
        });
      case 'sync':
        return planNoteSync({
          rendered,
          current,
          baseline: await this.baselines.get(citekey),
        });
    }
  }

  /** Sequentially present queued notes and apply the decisions. */
  private async reviewAndApply(
    queue: Array<{
      citekey: string;
      file: IVaultFile;
      plan: NoteSyncPlan;
      current: string;
    }>,
    result: BatchUpdateResult,
  ): Promise<void> {
    let blanket: 'apply' | 'skip' | null = null;

    for (let i = 0; i < queue.length; i++) {
      const { citekey, file, plan, current } = queue[i];
      let decision: ReviewDecision;

      if (blanket) {
        decision = blanket;
      } else {
        const item: NoteReviewItem = {
          citekey,
          filePath: file.path,
          hunks: lineDiff(current, plan.content),
          conflictCount: plan.conflicts.length,
          conflictIds: plan.conflicts.map((c) => c.id),
        };
        decision = await this.presenter!.review(item, queue.length - i - 1);
        if (decision === 'apply-all') {
          blanket = 'apply';
          decision = 'apply';
        } else if (decision === 'skip-all') {
          blanket = 'skip';
          decision = 'skip';
        }
      }

      try {
        if (decision === 'apply') {
          await this.write(citekey, file, plan.content, plan);
          result.updated.push(citekey);
        } else if (decision === 'take-theirs') {
          await this.write(citekey, file, plan.contentTakeTheirs, plan);
          result.updated.push(citekey);
        } else {
          result.conflicts.push({
            citekey,
            conflictIds: plan.conflicts.map((c) => c.id),
          });
        }
      } catch (e) {
        result.errors.push({
          citekey,
          error: (e as Error).message ?? String(e),
        });
      }
    }
  }

  /** Write the resolved content and persist the new baseline. */
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
