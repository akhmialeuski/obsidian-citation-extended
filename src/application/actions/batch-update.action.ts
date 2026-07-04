import { ApplicationAction } from './action.types';
import type {
  ActionContext,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';
import type { IContentTemplateResolver } from '../content-template-resolver';
import type {
  BatchUpdateResult,
  IBatchNoteOrchestrator,
} from '../../notes/batch/batch-update.types';

/**
 * Batch-updates all existing literature notes using the current content
 * template, honouring the configured update mode ("Smart sync" merges
 * plugin-owned callout blocks and frontmatter keys three-way, leaving all
 * user content untouched) and confirmation policy (conflicting notes go
 * through the diff review dialog).
 */
export class BatchUpdateNotesAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'batch-update-notes',
    name: 'Update all literature notes',
    icon: 'refresh-cw',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: false,
  };

  constructor(
    ctx: ActionContext,
    private readonly orchestrator: IBatchNoteOrchestrator,
    private readonly contentTemplateResolver: IContentTemplateResolver,
  ) {
    super(ctx);
  }

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    const { platform } = this.ctx;

    const templateStr = await this.contentTemplateResolver.resolve();
    const request = {
      citekeys: ['*'],
      templateStr,
      dryRun: false,
      mode: this.ctx.settings.noteUpdateMode,
      confirmation: this.ctx.settings.updateConfirmation,
    };

    platform.notifications.show('Citations: Updating literature notes…');

    // Single scan: execute() plans, reviews, and writes in one pass — no
    // separate count-only preview (which would double the render+read+plan
    // work over every note).
    const result = await this.orchestrator.execute(request, (progress) => {
      if (progress.current % 25 === 0 || progress.current === progress.total) {
        platform.notifications.show(
          `Citations: Scanned ${progress.current}/${progress.total} notes…`,
        );
      }
    });

    if (result.libraryNotReady) {
      platform.notifications.show('Citations: Library is not loaded yet.');
      return;
    }

    if (
      result.updated.length === 0 &&
      result.conflicts.length === 0 &&
      result.errors.length === 0
    ) {
      platform.notifications.show(
        'Citations: All notes are already up to date.',
      );
      return;
    }

    platform.notifications.show(
      `Citations: Batch update complete. ${BatchUpdateNotesAction.summarize(result)}`,
    );

    if (result.conflicts.length > 0) {
      console.debug(
        'Citations: notes left untouched with unresolved conflicts:',
        result.conflicts,
      );
    }
    if (result.errors.length > 0) {
      console.warn('Citations batch update errors:', result.errors);
    }
  }

  /** One-line summary for the completion notice. */
  static summarize(result: BatchUpdateResult): string {
    return [
      `Updated: ${result.updated.length}`,
      result.conflicts.length
        ? `Conflicts skipped: ${result.conflicts.length}`
        : null,
      result.skipped.length ? `Skipped: ${result.skipped.length}` : null,
      result.errors.length ? `Errors: ${result.errors.length}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
