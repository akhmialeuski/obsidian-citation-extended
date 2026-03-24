import CitationPlugin from '../main';

/**
 * Handles editor context menu registration for the citation plugin.
 * Adds a "Open note for @citekey" item when the cursor is on a citation.
 */
export class ContextMenuHandler {
  constructor(private plugin: CitationPlugin) {}

  /**
   * Register a context menu item that appears on right-click in the editor
   * when the cursor is positioned on a citation. Uses the Obsidian
   * `editor-menu` workspace event.
   */
  register(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu) => {
        // Use the platform adapter to get the active editor proxy
        // instead of casting the event's editor parameter directly
        const proxyEditor = this.plugin.platform.workspace.getActiveEditor();
        if (!proxyEditor) return;

        const citekey =
          this.plugin.editorActions.extractCitekeyAtCursor(proxyEditor);
        if (!citekey) return;

        menu.addItem((item) => {
          item
            .setTitle(`Open note for @${citekey}`)
            .setIcon('book-open')
            .onClick(() => {
              void this.plugin.editorActions.openLiteratureNote(citekey, false);
            });
        });
      }),
    );
  }
}
