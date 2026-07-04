import { ApplicationAction } from './action.types';
import type {
  ActionContext,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';
import type { IContentTemplateResolver } from '../content-template-resolver';
import type { IBatchNoteOrchestrator } from '../../notes/batch/batch-update.types';

/**
 * Updates the literature note in the active pane from the current library
 * entry and content template, with the same sync semantics (and review
 * dialog) as the batch command, scoped to one note.
 *
 * The active file is matched back to a library entry via
 * {@link INoteService.findCitekeyForFile} (frontmatter identifier field,
 * exact title-template path, or unambiguous basename).
 */
export class UpdateCurrentNoteAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'update-current-note',
    name: 'Update literature note for current file',
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

    const file = platform.workspace.getActiveFile();
    if (!file) {
      platform.notifications.show('Citations: No active file.');
      return;
    }

    const library = this.ctx.libraryService.library;
    if (!library) {
      platform.notifications.show('Citations: Library is not loaded yet.');
      return;
    }

    // findCitekeyForFile renders the title template for every entry to match
    // the path; a broken template throws TemplateRenderError. The command is
    // invoked fire-and-forget, so surface the failure as a notice instead of
    // letting the rejection vanish.
    let citekey: string | null;
    try {
      citekey = this.ctx.noteService.findCitekeyForFile(file, library);
    } catch (e) {
      platform.notifications.show(
        `Citations: Could not match "${file.name}" — ${(e as Error).message}`,
      );
      return;
    }
    if (!citekey) {
      platform.notifications.show(
        `Citations: "${file.name}" does not match any library entry.`,
      );
      return;
    }

    const templateStr = await this.contentTemplateResolver.resolve();
    const result = await this.orchestrator.execute({
      citekeys: [citekey],
      templateStr,
      dryRun: false,
      mode: this.ctx.settings.noteUpdateMode,
      confirmation: this.ctx.settings.updateConfirmation,
      // Pin the write to the file the user is actually looking at.
      // Re-resolving the citekey by rendered title could bind a different
      // file (e.g. a stale note at the canonical path) and modify a file the
      // user never had open.
      files: { [citekey]: file },
    });

    if (result.libraryNotReady) {
      platform.notifications.show('Citations: Library is not loaded yet.');
      return;
    }
    if (result.errors.length > 0) {
      platform.notifications.show(
        `Citations: Failed to update "${citekey}": ${result.errors[0].error}`,
      );
      return;
    }
    if (result.updated.length > 0) {
      platform.notifications.show(`Citations: Updated note for "${citekey}".`);
      return;
    }
    if (result.conflicts.length > 0) {
      platform.notifications.show(
        `Citations: "${citekey}" left untouched (conflicts: ${result.conflicts[0].conflictIds.join(', ')}).`,
      );
      return;
    }
    platform.notifications.show(
      `Citations: Note for "${citekey}" is already up to date.`,
    );
  }
}
