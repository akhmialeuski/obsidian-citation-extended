import { LoadingStatus, LibraryState } from '../library/library-state';
import CitationPlugin from '../main';
import { IUIService } from '../container';
import { IStatusBarItem } from '../platform/platform-adapter';
import { CommandRegistry } from './command-registry';
import { ContextMenuHandler } from './context-menu-handler';
import { WorkspaceLeaf } from 'obsidian';
import { CitationEditorSuggest } from '../ui/suggest/citation-suggest';
import {
  ReferencesView,
  REFERENCES_VIEW_TYPE,
} from '../ui/views/references-view';
import {
  ActionRegistry,
  ActionContext,
  OpenNoteAction,
  InsertCitationAction,
  InsertNoteLinkAction,
  InsertNoteContentAction,
  InsertSubsequentCitationAction,
  InsertMultiCitationAction,
  RefreshLibraryAction,
  OpenNoteAtCursorAction,
  BatchUpdateNotesAction,
  UpdateCurrentNoteAction,
} from '../application/actions';

/**
 * Initializes all user-facing UI surfaces: command palette, context menu,
 * and status bar.
 *
 * Wires all {@link ApplicationAction} instances into the {@link ActionRegistry},
 * then hands the registry to {@link CommandRegistry} and {@link ContextMenuHandler}
 * so they can build their respective surfaces. Subscribes to library state
 * changes to keep the status bar and user notifications up to date.
 */
export class UIService implements IUIService {
  private statusBarItem!: IStatusBarItem;
  private unsubscribe: (() => void) | null = null;
  private lastNotifiedStatus?: LoadingStatus;

  private commandRegistry!: CommandRegistry;
  private contextMenuHandler!: ContextMenuHandler;

  constructor(private plugin: CitationPlugin) {}

  init(): void {
    this.statusBarItem = this.plugin.platform.addStatusBarItem();
    this.unsubscribe = this.plugin.libraryService.store.subscribe(
      (state: LibraryState) => {
        this.updateStatusBar(state);
        this.showStateNotices(state);
      },
    );

    // Build the action context from explicit dependencies
    const actionCtx: ActionContext = {
      citationService: this.plugin.citationService,
      platform: this.plugin.platform,
      noteService: this.plugin.noteService,
      libraryService: this.plugin.libraryService,
      templateService: this.plugin.templateService,
      settings: this.plugin.settings,
    };

    // Register all actions
    const actionRegistry = new ActionRegistry();
    actionRegistry.register(new OpenNoteAction(actionCtx));
    actionRegistry.register(new RefreshLibraryAction(actionCtx));
    actionRegistry.register(new InsertNoteLinkAction(actionCtx));
    actionRegistry.register(new InsertNoteContentAction(actionCtx));
    actionRegistry.register(new InsertCitationAction(actionCtx));
    actionRegistry.register(new OpenNoteAtCursorAction(actionCtx));
    actionRegistry.register(new InsertSubsequentCitationAction(actionCtx));
    actionRegistry.register(new InsertMultiCitationAction(actionCtx));
    actionRegistry.register(
      new BatchUpdateNotesAction(
        actionCtx,
        this.plugin.batchOrchestrator,
        this.plugin.contentTemplateResolver,
      ),
    );
    actionRegistry.register(
      new UpdateCurrentNoteAction(
        actionCtx,
        this.plugin.batchOrchestrator,
        this.plugin.contentTemplateResolver,
      ),
    );

    // Presentation adapters read from the registry
    this.commandRegistry = new CommandRegistry(
      this.plugin.app,
      this.plugin,
      actionRegistry,
      actionCtx,
      this.plugin.libraryService,
    );
    this.contextMenuHandler = new ContextMenuHandler(
      this.plugin,
      actionRegistry,
      actionCtx,
    );

    this.commandRegistry.registerAll();
    this.contextMenuHandler.register();

    this.registerInlineSuggest();
    this.registerReferencesView();
  }

  /** Registers the inline citekey autocomplete popover. */
  private registerInlineSuggest(): void {
    this.plugin.registerEditorSuggest(
      new CitationEditorSuggest(this.plugin.app, {
        libraryService: this.plugin.libraryService,
        citationService: this.plugin.citationService,
        settings: this.plugin.settings,
      }),
    );
  }

  /**
   * Registers the references sidebar view plus the command and ribbon icon
   * that reveal it.
   */
  private registerReferencesView(): void {
    const onOpenCitekey = (citekey: string): void => {
      const library = this.plugin.libraryService.library;
      if (!library) return;
      void this.plugin.noteService
        .openLiteratureNote(citekey, library, false)
        .catch((e: unknown) => console.error(e));
    };

    this.plugin.registerView(
      REFERENCES_VIEW_TYPE,
      (leaf) =>
        new ReferencesView(leaf, {
          libraryService: this.plugin.libraryService,
          templateService: this.plugin.templateService,
          settings: this.plugin.settings,
          onOpenCitekey,
        }),
    );

    this.plugin.addRibbonIcon(
      'quote-glyph',
      'Show references for current note',
      () => void this.activateReferencesView(),
    );

    this.plugin.addCommand({
      id: 'show-references-view',
      name: 'Show references for current note',
      callback: () => void this.activateReferencesView(),
    });
  }

  /** Reveals the references view, creating it in the right sidebar if needed. */
  private async activateReferencesView(): Promise<void> {
    const { workspace } = this.plugin.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(REFERENCES_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: REFERENCES_VIEW_TYPE, active: true });
    }
    // revealLeaf returns Promise<void> (Obsidian 1.7.2+, matching
    // minAppVersion); we only need the side effect, so fire-and-forget.
    void workspace.revealLeaf(leaf);
  }

  /** Updates the status bar text and CSS class to reflect current library loading state. */
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

  /** Shows user-facing notices on state transitions (errors, partial loads). Deduplicates by status. */
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

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
