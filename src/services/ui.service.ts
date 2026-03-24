import { LoadingStatus, LibraryState } from '../library/library-state';
import { CitationSearchModal } from '../ui/modals/citation-search-modal';
import { InsertCitationAction } from '../ui/modals/actions/insert-citation.action';
import { InsertSubsequentCitationAction } from '../ui/modals/actions/insert-subsequent-citation.action';
import { InsertMultiCitationAction } from '../ui/modals/actions/insert-multi-citation.action';
import { InsertNoteLinkAction } from '../ui/modals/actions/insert-note-link.action';
import { InsertNoteContentAction } from '../ui/modals/actions/insert-note-content.action';
import { OpenNoteAction } from '../ui/modals/actions/open-note.action';
import { SearchAction } from '../ui/modals/actions/search-action';
import CitationPlugin from '../main';
import { IUIService } from '../container';
import { IStatusBarItem, IEditorProxy } from '../platform/platform-adapter';

export class UIService implements IUIService {
  private statusBarItem!: IStatusBarItem;
  private unsubscribe: (() => void) | null = null;
  private lastNotifiedStatus?: LoadingStatus;

  constructor(private plugin: CitationPlugin) {}

  init(): void {
    this.statusBarItem = this.plugin.platform.addStatusBarItem();
    this.unsubscribe = this.plugin.libraryService.store.subscribe(
      (state: LibraryState) => {
        this.updateStatusBar(state);
        this.showStateNotices(state);
      },
    );

    this.registerCommands();
    this.registerEditorContextMenu();
  }

  private updateStatusBar(state: LibraryState): void {
    let text = '';
    let cls = '';

    switch (state.status) {
      case LoadingStatus.Idle:
        text = 'Citations: Idle';
        break;
      case LoadingStatus.Loading:
        text = 'Citations: Loading...';
        break;
      case LoadingStatus.Success:
        text = `Citations: ${state.progress?.current || 0} entries`;
        break;
      case LoadingStatus.Error:
        text = 'Citations: Error';
        cls = 'mod-error';
        break;
    }

    this.statusBarItem.setText(text);
    if (cls) {
      this.statusBarItem.addClass(cls);
    } else {
      this.statusBarItem.removeClass('mod-error');
    }
  }

  private showStateNotices(state: LibraryState): void {
    if (state.status === this.lastNotifiedStatus) return;
    this.lastNotifiedStatus = state.status;

    if (state.status === LoadingStatus.Error && state.parseErrors.length > 0) {
      this.plugin.platform.notifications.show(state.parseErrors[0]);
    } else if (
      state.status === LoadingStatus.Success &&
      state.parseErrors.length > 0
    ) {
      const entryCount = state.progress?.current ?? 0;
      this.plugin.platform.notifications.show(
        `Citations: Loaded ${entryCount} entries. ${state.parseErrors.length} entries skipped due to parse errors. Check console for details.`,
      );
    }
  }

  /**
   * Returns the currently selected text from the active editor, if any.
   */
  private getSelectedText(): string {
    const editor = this.plugin.platform.workspace.getActiveEditor();
    return editor?.getSelection() ?? '';
  }

  /**
   * Opens a citation search modal, injecting the current editor selection
   * into the action so templates can use {{selectedText}} and the search
   * input is pre-filled.
   */
  private openSearchModal(action: SearchAction): void {
    action.selectedText = this.getSelectedText();
    const modal = new CitationSearchModal(this.plugin.app, this.plugin, action);
    modal.open();
  }

  registerCommands(): void {
    this.plugin.addCommand({
      id: 'open-literature-note',
      name: 'Open literature note',

      callback: () => {
        this.openSearchModal(new OpenNoteAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'update-bib-data',
      name: 'Refresh citation database',

      callback: () => {
        void this.plugin.libraryService.load();
      },
    });

    // Use `callback` instead of `editorCallback` so that insert commands
    // are available in Canvas text nodes, Lineage views, and other
    // non-standard editor contexts.  The plugin methods already null-guard
    // the editor and show a Notice when none is found.
    this.plugin.addCommand({
      id: 'insert-citation',
      name: 'Insert literature note link',

      callback: () => {
        this.openSearchModal(new InsertNoteLinkAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'insert-literature-note-content',
      name: 'Insert literature note content in the current pane',
      callback: () => {
        this.openSearchModal(new InsertNoteContentAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'insert-markdown-citation',
      name: 'Insert Markdown citation',
      callback: () => {
        this.openSearchModal(new InsertCitationAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'open-note-at-cursor',
      name: 'Open literature note for citation at cursor',
      callback: () => {
        void this.plugin.editorActions.openNoteAtCursor();
      },
    });

    this.plugin.addCommand({
      id: 'insert-subsequent-citation',
      name: 'Insert subsequent citation',
      callback: () => {
        this.openSearchModal(new InsertSubsequentCitationAction(this.plugin));
      },
    });

    this.plugin.addCommand({
      id: 'insert-multiple-citations',
      name: 'Insert multiple citations',
      callback: () => {
        this.openSearchModal(new InsertMultiCitationAction(this.plugin));
      },
    });
  }

  /**
   * Register a context menu item that appears on right-click in the editor
   * when the cursor is positioned on a citation. Uses the Obsidian
   * `editor-menu` workspace event.
   */
  private registerEditorContextMenu(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu, editor) => {
        // The Obsidian Editor object implements getLine/getCursor,
        // which is all extractCitekeyAtCursor needs.
        const citekey = this.plugin.editorActions.extractCitekeyAtCursor(
          editor as unknown as IEditorProxy,
        );
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

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
