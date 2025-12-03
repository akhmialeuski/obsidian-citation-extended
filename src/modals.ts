import { App, EventRef, Notice, SuggestModal } from 'obsidian';
import CitationPlugin from './main';
import { Entry } from './types';
import { LibraryState, LoadingStatus } from './library-state';

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

export interface SearchAction {
  name: string;
  onChoose(item: Entry, evt: MouseEvent | KeyboardEvent): Promise<void>;
  renderItem?(item: Entry, el: HTMLElement): void;
  getInstructions?(): { command: string; purpose: string }[];
}

export class CitationSearchModal extends SuggestModal<Entry> {
  plugin: CitationPlugin;
  action: SearchAction;
  limit = 50;
  loadingEl: HTMLElement;
  errorEl: HTMLElement;
  eventRefs: EventRef[] = [];

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
    super.onOpen();

    this.eventRefs = [
      this.plugin.events.on('library-state-changed', (state) => {
        this.updateState(state);
      }),
    ];

    this.updateState(this.plugin.libraryService.state);

    this.inputTimeout = window.setTimeout(() => {
      this.inputEl.addEventListener('keydown', (ev) => this.onInputKeydown(ev));
      this.inputEl.addEventListener('keyup', (ev) => this.onInputKeyup(ev));
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
    this.eventRefs?.forEach((e) => this.plugin.events.offref(e));
    if (this.inputTimeout) {
      clearTimeout(this.inputTimeout);
      this.inputTimeout = undefined;
    }
    this.inputEl.removeEventListener('keydown', (ev) =>
      this.onInputKeydown(ev),
    );
    this.inputEl.removeEventListener('keyup', (ev) => this.onInputKeyup(ev));
  }

  getSuggestions(query: string): Entry[] {
    if (this.plugin.libraryService.isLibraryLoading) {
      return [];
    }

    if (!query) {
      return Object.values(this.plugin.libraryService.library.entries).slice(
        0,
        this.limit,
      );
    }

    const ids = this.plugin.libraryService.searchService.search(query);
    // Limit results here if SearchService doesn't
    return ids
      .slice(0, this.limit)
      .map((id) => this.plugin.libraryService.library.entries[id])
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
    this.action.onChoose(item, evt).catch(console.error);
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

export class OpenNoteAction implements SearchAction {
  name = 'Open literature note';
  constructor(private plugin: CitationPlugin) {}

  async onChoose(item: Entry, evt: MouseEvent | KeyboardEvent) {
    if (evt instanceof MouseEvent || evt.key == 'Enter') {
      const newPane =
        evt instanceof KeyboardEvent && (evt as KeyboardEvent).ctrlKey;
      await this.plugin.openLiteratureNote(item.id, newPane);
    } else if (evt.key == 'Tab') {
      if (evt.shiftKey) {
        const files = item.files || [];
        const pdfPaths = files.filter((path) =>
          path.toLowerCase().endsWith('pdf'),
        );
        if (pdfPaths.length == 0) {
          new Notice('This reference has no associated PDF files.');
        } else {
          open(`file://${pdfPaths[0]}`);
        }
      } else {
        open(item.zoteroSelectURI);
      }
    }
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to open literature note' },
      { command: 'ctrl ↵', purpose: 'to open literature note in a new pane' },
      { command: 'tab', purpose: 'open in Zotero' },
      { command: 'shift tab', purpose: 'open PDF' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}

export class InsertNoteLinkAction implements SearchAction {
  name = 'Insert literature note link';
  constructor(private plugin: CitationPlugin) {}

  async onChoose(item: Entry) {
    await this.plugin.insertLiteratureNoteLink(item.id);
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert literature note reference' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}

export class InsertNoteContentAction implements SearchAction {
  name = 'Insert literature note content';
  constructor(private plugin: CitationPlugin) {}

  async onChoose(item: Entry) {
    await this.plugin.insertLiteratureNoteContent(item.id);
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      {
        command: '↵',
        purpose: 'to insert literature note content in active pane',
      },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}

export class InsertCitationAction implements SearchAction {
  name = 'Insert citation';
  constructor(private plugin: CitationPlugin) {}

  async onChoose(item: Entry, evt: MouseEvent | KeyboardEvent) {
    const isAlternative = evt instanceof KeyboardEvent && evt.shiftKey;
    await this.plugin.insertMarkdownCitation(item.id, isAlternative);
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert Markdown citation' },
      { command: 'shift ↵', purpose: 'to insert secondary Markdown citation' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }
}
