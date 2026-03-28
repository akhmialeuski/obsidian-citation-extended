import type {
  ILibraryService,
  INoteService,
  ITemplateService,
} from '../../container';
import type { IVaultAccess } from '../../platform/platform-adapter';
import type {
  IBatchNoteOrchestrator,
  BatchUpdateRequest,
  BatchUpdateResult,
  BatchUpdateProgress,
} from './batch-update.types';

/**
 * Orchestrates bulk literature note updates.
 *
 * For each requested citekey the orchestrator:
 * 1. Looks up the entry in the current library.
 * 2. Finds the existing note file via {@link INoteService}.
 * 3. Renders the new content from the supplied template string.
 * 4. Skips the note when the rendered content is identical to the current one.
 * 5. Writes the new content via {@link IVaultAccess.modify} (unless dry-run).
 */
export class BatchNoteOrchestrator implements IBatchNoteOrchestrator {
  constructor(
    private readonly libraryService: ILibraryService,
    private readonly noteService: INoteService,
    private readonly templateService: ITemplateService,
    private readonly vault: IVaultAccess,
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
      return { updated: [], skipped: [], errors: [] };
    }

    const allCitekeys = Object.keys(library.entries);
    const citekeys =
      request.citekeys.length === 1 && request.citekeys[0] === '*'
        ? allCitekeys
        : request.citekeys;

    const updated: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ citekey: string; error: string }> = [];

    for (let i = 0; i < citekeys.length; i++) {
      const citekey = citekeys[i];

      onProgress?.({
        current: i + 1,
        total: citekeys.length,
        currentCitekey: citekey,
      });

      const entry = library.entries[citekey];
      if (!entry) {
        skipped.push(citekey);
        continue;
      }

      const file = this.noteService.findExistingLiteratureNoteFile(
        citekey,
        library,
      );
      if (!file) {
        skipped.push(citekey);
        continue;
      }

      try {
        const variables = this.templateService.getTemplateVariables(entry);
        const contentResult = this.templateService.render(
          request.templateStr,
          variables,
        );
        if (!contentResult.ok) {
          errors.push({ citekey, error: contentResult.error.message });
          continue;
        }

        const newContent = contentResult.value;
        const currentContent = await this.vault.read(file);

        if (currentContent === newContent) {
          skipped.push(citekey);
          continue;
        }

        if (!dryRun) {
          await this.vault.modify(file, newContent);
        }
        updated.push(citekey);
      } catch (e) {
        errors.push({ citekey, error: (e as Error).message ?? String(e) });
      }
    }

    return { updated, skipped, errors };
  }
}
