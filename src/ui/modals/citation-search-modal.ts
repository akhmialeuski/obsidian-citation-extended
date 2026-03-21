import { App, SuggestModal } from 'obsidian';
import CitationPlugin from '../../main';
import { Entry } from '../../core';
import { LibraryState, LoadingStatus } from '../../library/library-state';
import { SearchAction } from './actions/search-action';

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
  plugin: CitationPlugin;
  action: SearchAction;
  limit = 50;
  loadingEl: HTMLElement;
  errorEl: HTMLElement;
  private unsubscribeStore?: () => void;
  private boundKeydown = (ev: KeyboardEvent) => this.onInputKeydown(ev);
  private boundKeyup = (ev: KeyboardEvent) => this.onInputKeyup(ev);

  constructor(app: App, plugin: CitationPlugin, action: SearchAction) {
    super(app);
    this.plugin = plugin;
    this.action = action;
    this.setPlaceholder(action.name);
    if (action.getInstructions) {
      this.setInstructions(action.getInstructions());
    }

    this.resultContainerEl.addClass('zoteroModalResults');
    this.inputEl.setAttribute('spellcheck', 'false');

    const parent = this.resultContainerEl.parentElement;
    if (parent) {
      this.loadingEl = parent.createEl('div', {
        cls: 'zoteroModalLoading',
      });
    } else {
      this.loadingEl = this.resultContainerEl.createEl('div', {
        cls: 'zoteroModalLoading',
      });
    }
    this.loadingEl.createEl('div', { cls: 'zoteroModalLoadingAnimation' });
    this.loadingEl.createEl('p', {
      text: 'Loading citation database. Please wait...',
    });

    this.errorEl = this.loadingEl.createEl('div', {
      cls: 'zoteroModalError d-none',
    });
  }

  private inputTimeout: number | undefined;

  onOpen() {
    void super.onOpen();

    // Seed the search input with the editor's selected text
    if (this.action.selectedText) {
      this.inputEl.value = this.action.selectedText;
      this.inputEl.dispatchEvent(new Event('input'));
    }

    // subscribe fires immediately with current state, so no separate updateState call needed
    this.unsubscribeStore = this.plugin.libraryService.store.subscribe(
      (state) => {
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
    if (state.status === LoadingStatus.Loading) {
      this.setLoading(true);
      this.showError(null);
    } else if (state.status === LoadingStatus.Error) {
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
      clearTimeout(this.inputTimeout);
      this.inputTimeout = undefined;
    }
    this.inputEl.removeEventListener('keydown', this.boundKeydown);
    this.inputEl.removeEventListener('keyup', this.boundKeyup);
  }

  getSuggestions(query: string): Entry[] {
    const library = this.plugin.libraryService.library;
    if (this.plugin.libraryService.isLibraryLoading || !library) {
      return [];
    }

    if (!query) {
      return Object.values(library.entries).slice(0, this.limit);
    }

    const ids = this.plugin.libraryService.searchService.search(query);
    return ids
      .slice(0, this.limit)
      .map((id) => library.entries[id])
      .filter(Boolean);
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
    Promise.resolve(this.action.onChoose(item, evt)).catch(console.error);
  }

  renderSuggestion(entry: Entry, el: HTMLElement): void {
    if (this.action.renderItem) {
      this.action.renderItem(entry, el);
      return;
    }

    // Default rendering logic
    el.empty();
    const entryTitle = entry.title || '';

    const authorString = entry.authorString || '';
    let displayedAuthorString = authorString;

    if (entry.author && entry.author.length > 3) {
      const firstAuthors = entry.author
        .slice(0, 3)
        .map((a) => [a.given, a.family].filter(Boolean).join(' '));
      displayedAuthorString = firstAuthors.join(', ') + ' et al.';
    }

    const yearString = entry.year?.toString() || '';

    const container = el.createEl('div', { cls: 'zoteroResult' });
    container.createEl('span', {
      cls: 'zoteroTitle',
      text: entryTitle,
    });
    const citekey = entry.citekey || entry.id;
    const displayKey = entry._sourceDatabase
      ? `${entry._sourceDatabase}:${citekey}`
      : citekey;

    container.createEl('span', { cls: 'zoteroCitekey', text: displayKey });

    if (yearString) {
      container.createEl('span', {
        cls: 'zoteroYear',
        text: yearString,
      });
    }

    const authorsCls = entry.authorString
      ? 'zoteroAuthors'
      : 'zoteroAuthors zoteroAuthorsEmpty';
    container.createEl('span', {
      cls: authorsCls,
      text: displayedAuthorString,
    });
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
