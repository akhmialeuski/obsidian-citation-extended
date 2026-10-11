import { Plugin } from 'obsidian';
import type { IActionRegistry } from '../application/actions/action-registry';
import type { ActionContext } from '../application/actions/action.types';
import { extractCitekeyAtCursor } from '../application/citekey-extractor';

/**
 * Registers context menu items from the ActionRegistry.
 *
 * Iterates over actions with `showInContextMenu: true` when the cursor is on
 * a citekey or text is selected. Each action decides from the invocation
 * (citekey and selected text) whether it applies, via `isVisible`.
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

        const citekey = extractCitekeyAtCursor(proxyEditor) ?? undefined;
        const selectedText = proxyEditor.getSelection();
        if (!citekey && selectedText === '') return;

        const invocation = { citekey, selectedText };
        const suffix = citekey ? ` @${citekey}` : '';

        for (const action of this.actionRegistry.getContextMenuActions()) {
          if (action.isVisible(invocation) && action.isEnabled(invocation)) {
            menu.addItem((item) => {
              item
                .setTitle(`${action.descriptor.name}${suffix}`)
                .setIcon(action.descriptor.icon ?? 'book-open')
                .onClick(() => void action.execute(invocation));
            });
          }
        }
      }),
    );
  }
}
