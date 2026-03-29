import { Plugin } from 'obsidian';
import type { IActionRegistry } from '../application/actions/action-registry';
import type { ActionContext } from '../application/actions/action.types';
import { extractCitekeyAtCursor } from '../application/citekey-extractor';

/**
 * Registers context menu items from the ActionRegistry.
 *
 * Iterates over actions with `showInContextMenu: true` and adds a menu
 * item for each when the cursor is positioned on a citation citekey.
 * Adding a new context menu action = creating an action class with
 * `showInContextMenu: true` — no changes to this file needed.
 */
export class ContextMenuHandler {
  constructor(
    private plugin: Plugin,
    private actionRegistry: IActionRegistry,
    private actionCtx: ActionContext,
  ) {}

  register(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu) => {
        const proxyEditor = this.actionCtx.platform.workspace.getActiveEditor();
        if (!proxyEditor) return;

        const citekey = extractCitekeyAtCursor(proxyEditor);
        if (!citekey) return;

        const invocation = { citekey };

        for (const action of this.actionRegistry.getContextMenuActions()) {
          if (action.isVisible(invocation) && action.isEnabled(invocation)) {
            menu.addItem((item) => {
              item
                .setTitle(`${action.descriptor.name} @${citekey}`)
                .setIcon(action.descriptor.icon ?? 'book-open')
                .onClick(() => void action.execute(invocation));
            });
          }
        }
      }),
    );
  }
}
