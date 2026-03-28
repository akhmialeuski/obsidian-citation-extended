import { LoadingStatus, LibraryState } from '../library/library-state';
import CitationPlugin from '../main';
import { IUIService } from '../container';
import { IStatusBarItem } from '../platform/platform-adapter';
import { CommandRegistry } from './command-registry';
import { ContextMenuHandler } from './context-menu-handler';
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
} from '../application/actions';

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

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
