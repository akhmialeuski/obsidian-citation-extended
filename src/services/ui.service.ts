import { App } from 'obsidian';
import { LoadingStatus, LibraryState } from '../library-state';
import {
  CitationSearchModal,
  InsertCitationAction,
  InsertNoteLinkAction,
  InsertNoteContentAction,
  OpenNoteAction,
} from '../modals';
import CitationPlugin from '../main';
import { IUIService } from '../container';

export class UIService implements IUIService {
  private statusBarItem: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private app: App,
    private plugin: CitationPlugin,
  ) {
    this.statusBarItem = this.plugin.addStatusBarItem();
  }

  init(): void {
    this.unsubscribe = this.plugin.libraryService.store.subscribe(
      (state: LibraryState) => {
        this.updateStatusBar(state);
      },
    );

    this.registerCommands();
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

  registerCommands(): void {
    this.plugin.addCommand({
      id: 'open-literature-note',
      name: 'Open literature note',

      callback: () => {
        const modal = new CitationSearchModal(
          this.app,
          this.plugin,
          new OpenNoteAction(this.plugin),
        );
        modal.open();
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
        const modal = new CitationSearchModal(
          this.app,
          this.plugin,
          new InsertNoteLinkAction(this.plugin),
        );
        modal.open();
      },
    });

    this.plugin.addCommand({
      id: 'insert-literature-note-content',
      name: 'Insert literature note content in the current pane',
      callback: () => {
        const modal = new CitationSearchModal(
          this.app,
          this.plugin,
          new InsertNoteContentAction(this.plugin),
        );
        modal.open();
      },
    });

    this.plugin.addCommand({
      id: 'insert-markdown-citation',
      name: 'Insert Markdown citation',
      callback: () => {
        const modal = new CitationSearchModal(
          this.app,
          this.plugin,
          new InsertCitationAction(this.plugin),
        );
        modal.open();
      },
    });
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
