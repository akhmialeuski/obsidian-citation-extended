import {
  ApplicationAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

/**
 * Reloads the citation database by re-reading all configured data sources.
 *
 * Triggers a full library reload via {@link ILibraryService.load}, which
 * re-parses BibTeX/CSL-JSON/Hayagriva files and rebuilds the search index.
 * Passes `fullRefresh` so API-based sources (Readwise) bypass incremental
 * sync — this is the user's escape hatch to pick up remote deletions.
 */
export class RefreshLibraryAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'update-bib-data',
    name: 'Refresh citation database',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: false,
  };

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    await this.ctx.libraryService.load(false, { fullRefresh: true });
  }
}
