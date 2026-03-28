import { App, Plugin } from 'obsidian';
import { CitationSearchModal } from '../ui/modals/citation-search-modal';
import type { IActionRegistry } from '../application/actions/action-registry';
import {
  SearchModalAction,
  ActionContext,
} from '../application/actions/action.types';
import type { ILibraryService } from '../container';

/**
 * Registers Obsidian commands from the ActionRegistry.
 *
 * This is a thin presentation adapter: it reads actions from the registry
 * and maps them to Obsidian's addCommand API. No business logic lives here.
 */
export class CommandRegistry {
  constructor(
    private app: App,
    private plugin: Plugin,
    private actionRegistry: IActionRegistry,
    private actionCtx: ActionContext,
    private libraryService: ILibraryService,
  ) {}

  registerAll(): void {
    for (const action of this.actionRegistry.getCommandPaletteActions()) {
      this.plugin.addCommand({
        id: action.descriptor.id,
        name: action.descriptor.name,
        callback: () => {
          if (action instanceof SearchModalAction) {
            this.openSearchModal(action);
          } else {
            void action.execute({
              selectedText: this.getSelectedText(),
            });
          }
        },
      });
    }
  }

  private getSelectedText(): string {
    const editor = this.actionCtx.platform.workspace.getActiveEditor();
    return editor?.getSelection() ?? '';
  }

  private openSearchModal(action: SearchModalAction): void {
    action.selectedText = this.getSelectedText();
    const modal = new CitationSearchModal(
      this.app,
      action,
      this.libraryService,
      this.actionCtx.settings,
    );
    modal.open();
  }
}
