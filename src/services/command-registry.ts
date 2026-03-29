import { App, Editor, Plugin } from 'obsidian';
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
 *
 * Routing logic:
 * - {@link SearchModalAction} always uses `callback` — the modal handles editor access.
 * - Non-modal actions with `requiresEditor: true` use `editorCallback` so Obsidian
 *   automatically disables them when no editor is active.
 * - Non-modal actions with `requiresEditor: false` use plain `callback`.
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
      if (action instanceof SearchModalAction) {
        // Search modal actions always use callback — modal handles editor access
        this.plugin.addCommand({
          id: action.descriptor.id,
          name: action.descriptor.name,
          callback: () => this.openSearchModal(action),
        });
      } else if (action.descriptor.requiresEditor) {
        // Editor-required actions use editorCallback — Obsidian disables when no editor.
        // The editor argument is guaranteed by Obsidian to be non-null.
        this.plugin.addCommand({
          id: action.descriptor.id,
          name: action.descriptor.name,
          editorCallback: (editor: Editor) => {
            void action.execute({
              selectedText: editor.getSelection(),
            });
          },
        });
      } else {
        // Non-editor actions use plain callback
        this.plugin.addCommand({
          id: action.descriptor.id,
          name: action.descriptor.name,
          callback: () => {
            void action.execute({
              selectedText: this.getSelectedText(),
            });
          },
        });
      }
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
