import type {
  ILibraryService,
  INoteService,
  ITemplateService,
} from '../../container';
import type { IVaultAccess, IVaultFile } from '../../platform/platform-adapter';
import { lineDiff, normalizeLineEndings, planNoteSync } from '../../core';
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
 *    (diff dialog) according to the confirmation policy. A first sync that
 *    would append blocks into a non-empty note also goes through review —
 *    on legacy notes the appended content often duplicates unmarked body
 *    text, so it needs user consent.
 * 4. Persists the new baseline; the whole batch flushes the store once.
 *
 * Safety invariants:
 * - Each target FILE is written at most once per run — two citekeys whose
 *   titles render to the same path would otherwise chimera-merge or overwrite
 *   each other with no dialog.
 * - Before writing a reviewed note, the file is re-read and re-planned so
 *   edits made during the (user-paced) review are not silently clobbered.
 *   In overwrite mode a re-plan can never conflict, so a stale note is
 *   skipped and reported instead.
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

  async execute(
    request: BatchUpdateRequest,
    onProgress?: (progress: BatchUpdateProgress) => void,
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
    /** Files already targeted this run — a second citekey resolving to the
     *  same path must not write over the first one's result. */
    const seenPaths = new Set<string>();
    // One shared vault snapshot for the whole batch: the fallback lookups
    // (case-insensitive path, moved-note basename, frontmatter id) each scan
    // the vault once total instead of once per citekey.
    const lookupIndex = this.noteService.createNoteLookupIndex();

    for (let i = 0; i < citekeys.length; i++) {
      const citekey = citekeys[i];

      onProgress?.({
        current: i + 1,
        total: citekeys.length,
        currentCitekey: citekey,
      });

      const entry = library.getEntry(citekey);
      if (!entry) {
        result.skipped.push(citekey);
        continue;
      }

      const file =
        request.files?.[citekey] ??
        this.noteService.findExistingLiteratureNoteFile(
          citekey,
          library,
          lookupIndex,
        );
      if (!file) {
        result.skipped.push(citekey);
        continue;
      }
      if (seenPaths.has(file.path)) {
        result.errors.push({
          citekey,
          error:
            `note file "${file.path}" is already targeted by another entry ` +
            'in this update — skipped to avoid overwriting it',
        });
        continue;
      }
      seenPaths.add(file.path);

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
        const priorBaseline =
          request.mode === 'overwrite'
            ? null
            : await this.baselines.get(citekey, file.path);
        const plan = planNoteSync({
          rendered,
          current,
          baseline: priorBaseline,
          mode: request.mode,
        });

        if (!plan.changed && plan.conflicts.length === 0) {
          // Bootstrap a baseline for a pristine note that has none yet (a
          // legacy note whose content already equals the render): without it,
          // a LATER library-side change is planned with no baseline and shows
          // up as a spurious conflict instead of a clean 3-way merge.
          if (
            request.mode !== 'overwrite' &&
            priorBaseline === null &&
            !request.dryRun
          ) {
            await this.baselines.set(citekey, plan.baseline, file.path);
          }
          result.skipped.push(citekey);
          continue;
        }

        // First sync of a pre-existing, non-empty note that would APPEND
        // blocks: on legacy notes the appended content usually duplicates
        // unmarked body text, so it needs the user's eyes even though it is
        // not a merge conflict.
        const firstSyncAppend =
          request.mode === 'sync' &&
          priorBaseline === null &&
          plan.summary.blocksAppended.length > 0 &&
          current.trim() !== '';

        const needsReview =
          plan.conflicts.length > 0 ||
          request.confirmation === 'always' ||
          firstSyncAppend;

        // Direct write path: no review needed, or review is impossible
        // (dry-run / 'never' / no presenter). We only write when there is a
        // clean, applicable change; conflicts without a decision are reported.
        if (
          !needsReview ||
          request.dryRun ||
          request.confirmation === 'never' ||
          !this.presenter
        ) {
          if (plan.conflicts.length > 0) {
            // Cannot resolve without the user — leave the note untouched.
            this.reportConflict(
              result,
              citekey,
              plan.conflicts.map((c) => c.id),
            );
            continue;
          }
          if (request.dryRun) {
            result.updated.push(citekey);
            continue;
          }
          if (firstSyncAppend) {
            // The safety gate wins over 'never': appending blocks into a
            // non-empty legacy note can duplicate its body text, so when no
            // review is possible we skip and report rather than silently
            // append without the consent the review would have obtained.
            this.reportConflict(result, citekey, [
              'first-sync-append-needs-review',
            ]);
            continue;
          }
          await this.write(citekey, file, plan.content, plan);
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

    if (reviewQueue.length > 0 && this.presenter && !request.dryRun) {
      await this.reviewAndApply(reviewQueue, result);
    }

    // No-op when nothing was recorded; the store tracks its own dirty state.
    await this.baselines.flush();

    return result;
  }

  /** Build the sync plan for the requested mode. */
  private async buildPlan(
    mode: NoteUpdateMode,
    citekey: string,
    rendered: string,
    current: string,
    notePath: string,
  ): Promise<NoteSyncPlan> {
    return planNoteSync({
      rendered,
      current,
      baseline:
        mode === 'overwrite'
          ? null
          : await this.baselines.get(citekey, notePath),
      mode,
    });
  }

  /**
   * Sequentially present queued notes and apply the decisions. Each note is
   * re-read and re-planned immediately before writing so edits made during the
   * review are respected.
   */
  private async reviewAndApply(
    queue: QueuedNote[],
    result: BatchUpdateResult,
  ): Promise<void> {
    let blanket: 'apply' | 'skip' | null = null;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      let decision: ReviewDecision;

      if (blanket) {
        decision = blanket;
      } else {
        // Diff against the LF-normalized current text: the plan's output is
        // always LF, and diffing raw CRLF lines against it would render the
        // whole note as removed+added, hiding the actual change.
        const currentLf = normalizeLineEndings(item.current);
        const reviewItem: NoteReviewItem = {
          citekey: item.citekey,
          filePath: item.file.path,
          hunks: lineDiff(currentLf, item.plan.content),
          hunksTakeTheirs:
            item.plan.conflicts.length > 0
              ? lineDiff(currentLf, item.plan.contentTakeTheirs)
              : undefined,
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
        // A note reviewed only by policy ('always' / first-sync append) has no
        // conflicts; skipping it is a plain skip, not a conflict — reporting it
        // as a conflict with an empty id list is misleading ("conflicts: ()").
        if (item.plan.conflicts.length > 0) {
          this.reportConflict(
            result,
            item.citekey,
            item.plan.conflicts.map((c) => c.id),
          );
        } else {
          result.skipped.push(item.citekey);
        }
        continue;
      }

      try {
        await this.applyReviewed(item, decision, result);
      } catch (e) {
        result.errors.push({
          citekey: item.citekey,
          error: (e as Error).message ?? String(e),
        });
      }
    }
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
  ): Promise<void> {
    const fresh = await this.vault.read(item.file);
    let plan = item.plan;
    if (fresh !== item.current) {
      if (item.mode === 'overwrite') {
        // An overwrite re-plan can never surface a conflict (it has none by
        // construction), so the generic guard below would silently clobber
        // whatever the user typed while the dialog was open. Skip instead.
        this.reportConflict(result, item.citekey, ['edited-during-review']);
        return;
      }
      // The file moved under us during review — re-plan against reality.
      plan = await this.buildPlan(
        item.mode,
        item.citekey,
        item.rendered,
        fresh,
        item.file.path,
      );
      if (!plan.changed && plan.conflicts.length === 0) {
        result.skipped.push(item.citekey);
        return;
      }
      if (plan.conflicts.length > 0) {
        // New conflicts appeared since the reviewed diff — don't apply a stale
        // decision to content the user never saw.
        this.reportConflict(
          result,
          item.citekey,
          plan.conflicts.map((c) => c.id),
        );
        return;
      }
    }

    const content =
      decision === 'take-theirs' ? plan.contentTakeTheirs : plan.content;
    await this.write(item.citekey, item.file, content, plan);
    result.updated.push(item.citekey);
  }

  /** Write the resolved content and record the new baseline (not yet flushed). */
  private async write(
    citekey: string,
    file: IVaultFile,
    content: string,
    plan: NoteSyncPlan,
  ): Promise<void> {
    await this.vault.modify(file, content);
    await this.baselines.set(citekey, plan.baseline, file.path);
  }

  /** Record a note that could not be applied without user resolution. */
  private reportConflict(
    result: BatchUpdateResult,
    citekey: string,
    conflictIds: string[],
  ): void {
    result.conflicts.push({ citekey, conflictIds });
  }
}
