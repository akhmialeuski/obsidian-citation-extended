import {
  App,
  EventRef,
  FuzzyMatch,
  FuzzySuggestModal,
  Notice,
  renderMatches,
  SearchMatches,
  SearchMatchPart,
} from 'obsidian';
import CitationPlugin from './main';
import { Entry } from './types';

// Stub some methods we know are there..
interface FuzzySuggestModalExt<T> extends FuzzySuggestModal<T> {
  chooser: ChooserExt;
}
interface ChooserExt {
  useSelectedItem(evt: MouseEvent | KeyboardEvent): void;
}
interface FuzzySuggestModalWithUpdate<T> extends FuzzySuggestModal<T> {
  updateSuggestions(): void;
}

export interface SearchAction {
  name: string;
  onChoose(item: Entry, evt: MouseEvent | KeyboardEvent): Promise<void>;
  renderItem?(item: Entry, el: HTMLElement): void;
  getInstructions?(): { command: string; purpose: string }[];
}

export class CitationSearchModal extends FuzzySuggestModal<Entry> {
  plugin: CitationPlugin;
  action: SearchAction;
  limit = 50;
  loadingEl: HTMLElement;
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
  }

  onOpen() {
    super.onOpen();

    this.eventRefs = [
      this.plugin.events.on('library-load-start', () => {
        this.setLoading(true);
      }),

      this.plugin.events.on('library-load-complete', () => {
        this.setLoading(false);
      }),
    ];

    this.setLoading(this.plugin.libraryService.isLibraryLoading);

    setTimeout(() => {
      this.inputEl.addEventListener('keydown', (ev) => this.onInputKeydown(ev));
      this.inputEl.addEventListener('keyup', (ev) => this.onInputKeyup(ev));
    }, 200);
  }

  onClose() {
    this.eventRefs?.forEach((e) => this.plugin.events.offref(e));
  }

  getItems(): Entry[] {
    if (this.plugin.libraryService.isLibraryLoading) {
      return [];
    }
    return Object.values(this.plugin.libraryService.library.entries);
  }

  getItemText(item: Entry): string {
    return `${item.title} ${item.authorString} ${item.year}`;
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
      ((this as unknown) as FuzzySuggestModalWithUpdate<Entry>).updateSuggestions();
    }
  }

  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    this.action.onChoose(item, evt).catch(console.error);
  }

  renderSuggestion(match: FuzzyMatch<Entry>, el: HTMLElement): void {
    if (this.action.renderItem) {
      this.action.renderItem(match.item, el);
      return;
    }

    // Default rendering logic
    el.empty();
    const entry = match.item;
    const entryTitle = entry.title || '';

    let authorString = entry.authorString || '';
    let displayedAuthorString = authorString;
    let isTruncated = false;

    if (entry.author && entry.author.length > 3) {
      const firstAuthors = entry.author.slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(' '));
      displayedAuthorString = firstAuthors.join(', ') + ' et al.';
      isTruncated = true;
    }

    const yearString = entry.year?.toString() || '';

    const container = el.createEl('div', { cls: 'zoteroResult' });
    const titleEl = container.createEl('span', {
      cls: 'zoteroTitle',
    });
    container.createEl('span', { cls: 'zoteroCitekey', text: entry.id });

    if (yearString) {
      const yearEl = container.createEl('span', {
        cls: 'zoteroYear',
      });
      // We will render matches for year later
    }

    const authorsCls = entry.authorString
      ? 'zoteroAuthors'
      : 'zoteroAuthors zoteroAuthorsEmpty';
    const authorsEl = container.createEl('span', {
      cls: authorsCls,
    });

    const allMatches = match.match.matches;
    const authorStringOffset = 1 + entryTitle.length;
    const yearOffset = authorStringOffset + authorString.length + 1;

    const shiftMatches = (
      matches: SearchMatches,
      start: number,
      end: number,
    ) => {
      return matches
        .map((match: SearchMatchPart) => {
          const [matchStart, matchEnd] = match;
          return [
            matchStart - start,
            Math.min(matchEnd - start, end),
          ] as SearchMatchPart;
        })
        .filter((match: SearchMatchPart) => {
          const [matchStart] = match;
          return matchStart >= 0;
        });
    };

    renderMatches(
      titleEl,
      entryTitle,
      shiftMatches(allMatches, 0, entryTitle.length),
    );

    if (entry.authorString) {
      let authorMatches = shiftMatches(
        allMatches,
        authorStringOffset,
        authorStringOffset + entry.authorString.length,
      );

      if (isTruncated) {
        // Filter matches to only those that fit in the truncated string (excluding " et al.")
        const visibleLength = displayedAuthorString.length - 7; // " et al.".length = 7
        authorMatches = authorMatches.filter(m => m[1] <= visibleLength);
      }

      renderMatches(
        authorsEl,
        displayedAuthorString,
        authorMatches,
      );
    }

    if (yearString) {
      const yearEl = container.querySelector('.zoteroYear') as HTMLElement;
      if (yearEl) {
        renderMatches(
          yearEl,
          yearString,
          shiftMatches(
            allMatches,
            yearOffset,
            yearOffset + yearString.length,
          ),
        );
      }
    }
  }

  onInputKeydown(ev: KeyboardEvent) {
    if (ev.key == 'Tab') {
      ev.preventDefault();
    }
  }

  onInputKeyup(ev: KeyboardEvent) {
    if (ev.key == 'Enter' || ev.key == 'Tab') {
      ((this as unknown) as FuzzySuggestModalExt<Entry>).chooser.useSelectedItem(
        ev,
      );
    }
  }
}

export class OpenNoteAction implements SearchAction {
  name = 'Open literature note';
  constructor(private plugin: CitationPlugin) { }

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
  constructor(private plugin: CitationPlugin) { }

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
  constructor(private plugin: CitationPlugin) { }

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
  constructor(private plugin: CitationPlugin) { }

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
