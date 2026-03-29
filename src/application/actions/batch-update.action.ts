import { ApplicationAction } from './action.types';
import type {
  ActionContext,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';
import type { IContentTemplateResolver } from '../content-template-resolver';
import type { IBatchNoteOrchestrator } from '../../notes/batch/batch-update.types';

/**
 * Batch-updates all existing literature notes using the current content template.
 *
 * Flow:
 * 1. Resolves the template string via {@link IContentTemplateResolver}.
 * 2. Runs a dry-run preview to count what would change.
 * 3. If changes exist, executes the actual update with progress notifications.
 *
 * Only notes whose rendered content differs from their current content are written.
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- invocation unused for batch actions
  async execute(_invocation: ActionInvocationContext): Promise<void> {
    const { platform } = this.ctx;

    const templateStr = await this.contentTemplateResolver.resolve();
    const request = { citekeys: ['*'], templateStr, dryRun: false };

    // Dry-run preview to count changes before writing anything
    const preview = await this.orchestrator.preview(request);
    const changeCount = preview.updated.length;

    if (changeCount === 0) {
      platform.notifications.show(
        'Citations: All notes are already up to date.',
      );
      return;
    }

    platform.notifications.show(
      `Citations: Updating ${changeCount} note${changeCount === 1 ? '' : 's'}…`,
    );

    const result = await this.orchestrator.execute(request, (progress) => {
      if (progress.current % 10 === 0 || progress.current === progress.total) {
        platform.notifications.show(
          `Citations: Updated ${progress.current}/${progress.total} notes…`,
        );
      }
    });

    const summary = [
      `Updated: ${result.updated.length}`,
      result.skipped.length ? `Skipped: ${result.skipped.length}` : null,
      result.errors.length ? `Errors: ${result.errors.length}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    platform.notifications.show(`Citations: Batch update complete. ${summary}`);

    if (result.errors.length > 0) {
      console.warn('Citations batch update errors:', result.errors);
    }
  }
}
