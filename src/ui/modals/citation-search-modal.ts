import { App, SuggestModal } from 'obsidian';
import { Entry } from '../../core';
import { LibraryState, LoadingStatus } from '../../library/library-state';
import type { SearchModalAction } from '../../application/actions/action.types';
import type { ILibraryService } from '../../container';
import type { CitationsPluginSettings } from '../settings/settings';
import { sortEntries } from '../../library/sort-entries';
import { AUTHOR_DISPLAY_LIMIT, renderEntrySuggestion } from '../render-entry';

// Stub some methods we know are there..
interface SuggestModalExt<T> extends SuggestModal<T> {
  chooser: ChooserExt;
}
interface ChooserExt {
  useSelectedItem(evt: MouseEvent | KeyboardEvent): void;
}
interface SuggestModalWithUpdate<T> extends SuggestModal<T> {
  updateSuggestions(): void;
}

export class CitationSearchModal extends SuggestModal<Entry> {
  limit = 50;
  loadingEl: HTMLElement;
  errorEl: HTMLElement;
  private unsubscribeStore?: () => void;
  private boundKeydown = (ev: KeyboardEvent) => this.onInputKeydown(ev);
  private boundKeyup = (ev: KeyboardEvent) => this.onInputKeyup(ev);
  /** True when the modal is closing to immediately reopen (keepOpen cycle). */
  private isReopening = false;

  constructor(
    app: App,
    private action: SearchModalAction,
    private libraryService: ILibraryService,
    private settings: CitationsPluginSettings,
  ) {
    super(app);
    this.setPlaceholder(action.descriptor.name);
    if (action.getInstructions) {
      this.setInstructions(action.getInstructions());
    }

    this.resultContainerEl.addClass('zoteroModalResults');
    this.inputEl.setAttribute('spellcheck', 'false');

    const parent = this.resultContainerEl.parentElement;
    if (parent) {
      this.loadingEl = parent.createDiv({
        cls: 'zoteroModalLoading',
      });
    } else {
      this.loadingEl = this.resultContainerEl.createDiv({
        cls: 'zoteroModalLoading',
      });
    }
    this.loadingEl.createDiv({ cls: 'zoteroModalLoadingAnimation' });
    this.loadingEl.createEl('p', {
      text: 'Loading citation database. Please wait...',
    });

    this.errorEl = this.loadingEl.createDiv({
      cls: 'zoteroModalError d-none',
    });
  }

  private inputTimeout: number | undefined;

  onOpen() {
    void super.onOpen();

    // Seed the search input with the editor's selected text
    if (this.action.selectedText) {
      this.inputEl.value = this.action.selectedText;
      this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // subscribe fires immediately with current state, so no separate updateState call needed
    this.unsubscribeStore = this.libraryService.store.subscribe(
      (state: LibraryState) => {
        this.updateState(state);
      },
    );

    this.inputTimeout = window.setTimeout(() => {
      this.inputEl.addEventListener('keydown', this.boundKeydown);
      this.inputEl.addEventListener('keyup', this.boundKeyup);
      this.inputTimeout = undefined;
    }, 200);
  }

  updateState(state: LibraryState) {
    // Stale-while-revalidate: when a previously loaded library is available,
    // keep the modal fully usable during background reloads (and transient
    // reload errors) instead of blanking the results and disabling input.
    // The blocking loading/error UI is shown only before the FIRST successful
    // load, when there is genuinely nothing to search.
    const hasData = this.libraryService.library !== null;
    if (state.status === LoadingStatus.Loading && !hasData) {
      this.setLoading(true);
      this.showError(null);
    } else if (state.status === LoadingStatus.Error && !hasData) {
      this.setLoading(false);
      this.showError(state.error?.message || 'Unknown error');
    } else {
      this.setLoading(false);
      this.showError(null);
    }
  }

  showError(message: string | null) {
    if (message) {
      this.loadingEl.removeClass('d-none');
      // Hide loading animation and text
      this.loadingEl.children[0].addClass('d-none');
      this.loadingEl.children[1].addClass('d-none');

      this.errorEl.removeClass('d-none');
      this.errorEl.setText(`Error: ${message}`);
      this.inputEl.disabled = true;
      this.resultContainerEl.empty();
    } else {
      this.errorEl.addClass('d-none');
      // Show loading animation and text (if loading)
      this.loadingEl.children[0].removeClass('d-none');
      this.loadingEl.children[1].removeClass('d-none');
    }
  }

  onClose() {
    this.unsubscribeStore?.();
    if (this.inputTimeout) {
      window.clearTimeout(this.inputTimeout);
      this.inputTimeout = undefined;
    }
    this.inputEl.removeEventListener('keydown', this.boundKeydown);
    this.inputEl.removeEventListener('keyup', this.boundKeyup);

    // Notify the action only when the modal is truly dismissed (Esc or
    // Shift+Enter), not during intermediate keepOpen reopen cycles.
    if (!this.isReopening) {
      this.action.onClose?.();
    }
  }

  getSuggestions(query: string): Entry[] {
    // Search the last loaded library even while a background reload is in
    // progress (stale-while-revalidate); block only before the first load.
    const library = this.libraryService.library;
    if (!library) {
      return [];
    }

    const sortOrder = this.settings.referenceListSortOrder;

    if (!query) {
      // Sorted once per library build and cached in the service — this runs
      // on every input event, so it must not sort the whole library here.
      return this.libraryService
        .getSortedEntries(sortOrder)
        .slice(0, this.limit);
    }

    const ids = this.libraryService.searchService.search(query, this.limit);
    const entries = ids.map((id) => library.entries[id]).filter(Boolean);
    return sortEntries(entries, sortOrder);
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.loadingEl.removeClass('d-none');
      this.inputEl.disabled = true;
      this.resultContainerEl.empty();
    } else {
      this.loadingEl.addClass('d-none');
      this.inputEl.disabled = false;
      this.inputEl.focus();
      (this as unknown as SuggestModalWithUpdate<Entry>).updateSuggestions();
    }
  }

  onChooseSuggestion(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    const result = this.action.onChoose(item, evt);
    if (result instanceof Promise) {
      void result.catch((e: unknown) => console.error(e));
    }

    // In multi-select mode, re-open the modal after each selection
    if (this.action.keepOpen) {
      this.isReopening = true;
      window.setTimeout(() => {
        const modal = new CitationSearchModal(
          this.app,
          this.action,
          this.libraryService,
          this.settings,
        );
        modal.open();
      }, 50);
    }
  }

  renderSuggestion(entry: Entry, el: HTMLElement): void {
    if (this.action.renderItem) {
      this.action.renderItem(entry, el);
      return;
    }

    // Default rendering logic — shared with the inline editor suggester.
    el.empty();
    const container = el.createDiv({ cls: 'zoteroResult' });
    renderEntrySuggestion(container, entry, AUTHOR_DISPLAY_LIMIT);
  }

  onInputKeydown(ev: KeyboardEvent) {
    if (ev.key == 'Tab') {
      ev.preventDefault();
    }
  }

  onInputKeyup(ev: KeyboardEvent) {
    if (ev.key == 'Enter' || ev.key == 'Tab') {
      (this as unknown as SuggestModalExt<Entry>).chooser.useSelectedItem(ev);
    }
  }
}
