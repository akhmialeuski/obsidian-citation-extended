import { LoadingStatus, LibraryState } from '../library/library-state';
import CitationPlugin from '../main';
import { IUIService } from '../container';
import { IStatusBarItem } from '../platform/platform-adapter';
import { CommandRegistry } from './command-registry';
import { ContextMenuHandler } from './context-menu-handler';

export class UIService implements IUIService {
  private statusBarItem!: IStatusBarItem;
  private unsubscribe: (() => void) | null = null;
  private lastNotifiedStatus?: LoadingStatus;

  private commandRegistry: CommandRegistry;
  private contextMenuHandler: ContextMenuHandler;

  constructor(private plugin: CitationPlugin) {
    this.commandRegistry = new CommandRegistry(plugin);
    this.contextMenuHandler = new ContextMenuHandler(plugin);
  }

  init(): void {
    this.statusBarItem = this.plugin.platform.addStatusBarItem();
    this.unsubscribe = this.plugin.libraryService.store.subscribe(
      (state: LibraryState) => {
        this.updateStatusBar(state);
        this.showStateNotices(state);
      },
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
