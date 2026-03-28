import {
  ApplicationAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

export class RefreshLibraryAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'update-bib-data',
    name: 'Refresh citation database',
    showInCommandPalette: true,
    showInContextMenu: false,
    requiresEditor: false,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_invocation: ActionInvocationContext): Promise<void> {
    await this.ctx.libraryService.load();
  }
}
