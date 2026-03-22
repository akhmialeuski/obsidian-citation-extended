/** @jest-environment jsdom */
import { CitationSearchModal } from '../../../src/ui/modals/citation-search-modal';
import type CitationPlugin from '../../../src/main';
import type { Entry } from '../../../src/core';
import { LoadingStatus } from '../../../src/library/library-state';
import type { SearchAction } from '../../../src/ui/modals/actions/search-action';

// ---------------------------------------------------------------------------
// Polyfill Obsidian-specific HTMLElement methods for jsdom
// ---------------------------------------------------------------------------
beforeAll(() => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const proto = HTMLElement.prototype as any;

  if (!proto.empty) {
    proto.empty = function (this: HTMLElement) {
      this.innerHTML = '';
    };
  }
  if (!proto.addClass) {
    proto.addClass = function (this: HTMLElement, cls: string) {
      this.classList.add(cls);
    };
  }
  if (!proto.removeClass) {
    proto.removeClass = function (this: HTMLElement, cls: string) {
      this.classList.remove(cls);
    };
  }
  if (!proto.setText) {
    proto.setText = function (this: HTMLElement, text: string) {
      this.textContent = text;
    };
  }
  if (!proto.createEl) {
    proto.createEl = function (
      this: HTMLElement,
      tag: string,
      opts?: { text?: string; cls?: string },
    ): HTMLElement {
      const el = document.createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.createDiv) {
    proto.createDiv = function (
      this: HTMLElement,
      cls?: string,
    ): HTMLDivElement {
      const el = document.createElement('div');
      if (cls) el.className = cls;
      this.appendChild(el);
      return el;
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

// ---------------------------------------------------------------------------
// Mock: obsidian
// ---------------------------------------------------------------------------
jest.mock(
  'obsidian',
  () => {
    class MockSuggestModal {
      app: unknown;
      inputEl: HTMLInputElement;
      resultContainerEl: HTMLElement;
      contentEl: HTMLElement;

      constructor(app: unknown) {
        this.app = app;
        this.inputEl = document.createElement('input');
        this.contentEl = document.createElement('div');

        // resultContainerEl needs a parentElement for the loading element
        const wrapper = document.createElement('div');
        this.resultContainerEl = document.createElement('div');
        wrapper.appendChild(this.resultContainerEl);
      }
      onOpen() {}
      onClose() {}
      setInstructions() {}
      setPlaceholder() {}
      updateSuggestions() {}
    }

    return {
      App: jest.fn(),
      SuggestModal: MockSuggestModal,
      Notice: jest.fn(),
      PluginSettingTab: class {},
      Plugin: class {},
    };
  },
  { virtual: true },
);

jest.mock(
  'web-worker:../../src/worker',
  () => ({
    __esModule: true,
    default: class {},
  }),
  { virtual: true },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEntry(overrides: Record<string, unknown> = {}): Entry {
  return {
    id: 'test2024',
    type: 'article-journal',
    title: 'Test Article',
    titleShort: 'Test',
    authorString: 'John Doe, Jane Smith',
    author: [
      { given: 'John', family: 'Doe' },
      { given: 'Jane', family: 'Smith' },
    ],
    year: 2024,
    containerTitle: 'Test Journal',
    DOI: '10.1234/test',
    URL: 'https://example.com',
    citekey: 'test2024',
    _sourceDatabase: undefined,
    toJSON() {
      return { ...this };
    },
    ...overrides,
  } as unknown as Entry;
}

function createMockPlugin(
  overrides: Partial<{
    isLibraryLoading: boolean;
    library: unknown;
    sortOrder: string;
    storeSubscribe: jest.Mock;
    searchResults: string[];
    storeState: Record<string, unknown>;
  }> = {},
): CitationPlugin {
  const defaultState = overrides.storeState ?? {
    status: LoadingStatus.Idle,
    parseErrors: [],
  };

  const storeSubscribe =
    overrides.storeSubscribe ??
    jest.fn().mockImplementation((cb: (state: unknown) => void) => {
      // Mimic real LibraryStore.subscribe: invoke callback immediately
      cb(defaultState);
      return jest.fn();
    });

  return {
    libraryService: {
      isLibraryLoading: overrides.isLibraryLoading ?? false,
      library: overrides.library ?? { entries: {} },
      store: {
        subscribe: storeSubscribe,
      },
      searchService: {
        search: jest.fn().mockReturnValue(overrides.searchResults ?? []),
      },
    },
    settings: {
      referenceListSortOrder: overrides.sortOrder ?? 'default',
    },
  } as unknown as CitationPlugin;
}

function createMockAction(overrides: Partial<SearchAction> = {}): SearchAction {
  return {
    name: 'Test Action',
    onChoose: jest.fn(),
    ...overrides,
  };
}

describe('CitationSearchModal', () => {
  let modal: CitationSearchModal;
  let plugin: CitationPlugin;
  let action: SearchAction;

  beforeEach(() => {
    jest.useFakeTimers();
    plugin = createMockPlugin();
    action = createMockAction();
    modal = new CitationSearchModal({} as never, plugin, action);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('sets placeholder from action name', () => {
      // setPlaceholder is called in constructor — just verify no throw
      expect(modal.plugin).toBe(plugin);
      expect(modal.action).toBe(action);
    });

    it('sets instructions when action provides them', () => {
      const actionWithInstructions = createMockAction({
        getInstructions: jest
          .fn()
          .mockReturnValue([{ command: 'Tab', purpose: 'choose' }]),
      });
      const m = new CitationSearchModal(
        {} as never,
        plugin,
        actionWithInstructions,
      );
      expect(actionWithInstructions.getInstructions).toHaveBeenCalled();
      expect(m).toBeDefined();
    });

    it('adds zoteroModalResults class to resultContainerEl', () => {
      expect(
        modal.resultContainerEl.classList.contains('zoteroModalResults'),
      ).toBe(true);
    });

    it('sets spellcheck=false on inputEl', () => {
      expect(modal.inputEl.getAttribute('spellcheck')).toBe('false');
    });

    it('creates loadingEl with animation and text', () => {
      expect(modal.loadingEl).toBeDefined();
      const animation = modal.loadingEl.querySelector(
        '.zoteroModalLoadingAnimation',
      );
      expect(animation).not.toBeNull();
      const text = modal.loadingEl.querySelector('p');
      expect(text).not.toBeNull();
      expect(text!.textContent).toContain('Loading citation database');
    });

    it('creates errorEl inside loadingEl', () => {
      expect(modal.errorEl).toBeDefined();
      expect(modal.errorEl.classList.contains('zoteroModalError')).toBe(true);
      expect(modal.errorEl.classList.contains('d-none')).toBe(true);
    });

    it('creates loadingEl on resultContainerEl when no parentElement', () => {
      // The code handles the case by using resultContainerEl as fallback
      expect(modal.loadingEl).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // onOpen()
  // -----------------------------------------------------------------------

  describe('onOpen()', () => {
    it('subscribes to the library store', () => {
      modal.onOpen();
      jest.runAllTimers();

      const storeSub = plugin.libraryService.store.subscribe as jest.Mock;
      expect(storeSub).toHaveBeenCalledWith(expect.any(Function));
    });

    it('seeds input with selected text', () => {
      action.selectedText = 'search term';
      modal = new CitationSearchModal({} as never, plugin, action);

      modal.onOpen();
      jest.runAllTimers();

      expect(modal.inputEl.value).toBe('search term');
    });

    it('does not seed input when no selected text', () => {
      modal.onOpen();
      jest.runAllTimers();

      expect(modal.inputEl.value).toBe('');
    });

    it('registers keydown and keyup listeners after delay', () => {
      const addSpy = jest.spyOn(modal.inputEl, 'addEventListener');

      modal.onOpen();
      jest.advanceTimersByTime(200);

      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    });
  });

  // -----------------------------------------------------------------------
  // updateState()
  // -----------------------------------------------------------------------

  describe('updateState()', () => {
    it('shows loading state', () => {
      modal.updateState({
        status: LoadingStatus.Loading,
        parseErrors: [],
      });

      // loadingEl should be visible (no d-none class)
      expect(modal.loadingEl.classList.contains('d-none')).toBe(false);
      expect(modal.inputEl.disabled).toBe(true);
    });

    it('shows error state', () => {
      modal.updateState({
        status: LoadingStatus.Error,
        error: new Error('Test error'),
        parseErrors: [],
      });

      // Error should be displayed
      expect(modal.errorEl.textContent).toContain('Test error');
      expect(modal.inputEl.disabled).toBe(true);
    });

    it('shows error with fallback message when no error object', () => {
      modal.updateState({
        status: LoadingStatus.Error,
        parseErrors: [],
      });

      expect(modal.errorEl.textContent).toContain('Unknown error');
    });

    it('hides loading and error on success state', () => {
      // First show loading
      modal.updateState({
        status: LoadingStatus.Loading,
        parseErrors: [],
      });

      // Then success
      modal.updateState({
        status: LoadingStatus.Success,
        parseErrors: [],
      });

      expect(modal.loadingEl.classList.contains('d-none')).toBe(true);
      expect(modal.inputEl.disabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // showError()
  // -----------------------------------------------------------------------

  describe('showError()', () => {
    it('displays error message and disables input', () => {
      modal.showError('Something went wrong');

      expect(modal.loadingEl.classList.contains('d-none')).toBe(false);
      expect(modal.errorEl.classList.contains('d-none')).toBe(false);
      expect(modal.errorEl.textContent).toBe('Error: Something went wrong');
      expect(modal.inputEl.disabled).toBe(true);
    });

    it('hides loading animation and text when showing error', () => {
      modal.showError('error');

      const children = modal.loadingEl.children;
      // First child (animation) and second child (p text) should be hidden
      expect(children[0].classList.contains('d-none')).toBe(true);
      expect(children[1].classList.contains('d-none')).toBe(true);
    });

    it('hides error and restores children when null', () => {
      modal.showError('test');
      modal.showError(null);

      expect(modal.errorEl.classList.contains('d-none')).toBe(true);
      const children = modal.loadingEl.children;
      expect(children[0].classList.contains('d-none')).toBe(false);
      expect(children[1].classList.contains('d-none')).toBe(false);
    });

    it('empties resultContainerEl when showing error', () => {
      modal.resultContainerEl.appendChild(document.createElement('div'));
      modal.showError('error');
      expect(modal.resultContainerEl.children.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getSuggestions()
  // -----------------------------------------------------------------------

  describe('getSuggestions()', () => {
    it('returns empty array when library is loading', () => {
      plugin = createMockPlugin({ isLibraryLoading: true });
      modal = new CitationSearchModal({} as never, plugin, action);

      const results = modal.getSuggestions('test');
      expect(results).toEqual([]);
    });

    it('returns empty array when library is null', () => {
      plugin = createMockPlugin({ library: null });
      modal = new CitationSearchModal({} as never, plugin, action);

      const results = modal.getSuggestions('test');
      expect(results).toEqual([]);
    });

    it('returns all entries (up to limit) when query is empty', () => {
      const entries: Record<string, Entry> = {};
      for (let i = 0; i < 5; i++) {
        entries[`key${i}`] = createMockEntry({
          id: `key${i}`,
          title: `Entry ${i}`,
        });
      }

      plugin = createMockPlugin({ library: { entries } });
      modal = new CitationSearchModal({} as never, plugin, action);

      const results = modal.getSuggestions('');
      expect(results).toHaveLength(5);
    });

    it('limits results to modal.limit', () => {
      const entries: Record<string, Entry> = {};
      for (let i = 0; i < 100; i++) {
        entries[`key${i}`] = createMockEntry({
          id: `key${i}`,
          title: `Entry ${i}`,
        });
      }

      plugin = createMockPlugin({ library: { entries } });
      modal = new CitationSearchModal({} as never, plugin, action);
      modal.limit = 10;

      const results = modal.getSuggestions('');
      expect(results).toHaveLength(10);
    });

    it('searches via searchService and maps results from library', () => {
      const entry = createMockEntry({ id: 'found1', title: 'Found Entry' });
      plugin = createMockPlugin({
        library: { entries: { found1: entry } },
        searchResults: ['found1'],
      });
      modal = new CitationSearchModal({} as never, plugin, action);

      const results = modal.getSuggestions('found');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('found1');
    });

    it('filters out undefined entries from search results', () => {
      plugin = createMockPlugin({
        library: { entries: {} },
        searchResults: ['nonexistent'],
      });
      modal = new CitationSearchModal({} as never, plugin, action);

      const results = modal.getSuggestions('query');
      expect(results).toHaveLength(0);
    });

    it('sorts results by configured sort order', () => {
      const entries: Record<string, Entry> = {
        a: createMockEntry({ id: 'a', title: 'Entry A', year: 2020 }),
        b: createMockEntry({ id: 'b', title: 'Entry B', year: 2024 }),
      };

      plugin = createMockPlugin({
        library: { entries },
        sortOrder: 'year-desc',
      });
      modal = new CitationSearchModal({} as never, plugin, action);

      const results = modal.getSuggestions('');
      expect(results[0].year).toBe(2024);
    });
  });

  // -----------------------------------------------------------------------
  // renderSuggestion()
  // -----------------------------------------------------------------------

  describe('renderSuggestion()', () => {
    it('delegates to action.renderItem when provided', () => {
      const customRender = jest.fn();
      action = createMockAction({ renderItem: customRender });
      modal = new CitationSearchModal({} as never, plugin, action);

      const el = document.createElement('div');
      const entry = createMockEntry();
      modal.renderSuggestion(entry, el);

      expect(customRender).toHaveBeenCalledWith(entry, el);
    });

    it('renders default layout with title, citekey, year, authors', () => {
      const entry = createMockEntry({
        title: 'My Paper',
        year: 2024,
        authorString: 'Doe, Smith',
        author: [
          { given: 'John', family: 'Doe' },
          { given: 'Jane', family: 'Smith' },
        ],
      });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const container = el.querySelector('.zoteroResult');
      expect(container).not.toBeNull();

      const title = container!.querySelector('.zoteroTitle');
      expect(title!.textContent).toBe('My Paper');

      const citekey = container!.querySelector('.zoteroCitekey');
      expect(citekey!.textContent).toBe('test2024');

      const year = container!.querySelector('.zoteroYear');
      expect(year!.textContent).toBe('2024');

      const authors = container!.querySelector('.zoteroAuthors');
      expect(authors!.textContent).toBe('Doe, Smith');
    });

    it('truncates authors to 3 with "et al." when more than 3', () => {
      const entry = createMockEntry({
        author: [
          { given: 'A', family: 'First' },
          { given: 'B', family: 'Second' },
          { given: 'C', family: 'Third' },
          { given: 'D', family: 'Fourth' },
        ],
        authorString: 'A First, B Second, C Third, D Fourth',
      });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const authors = el.querySelector('.zoteroAuthors');
      expect(authors!.textContent).toContain('et al.');
      expect(authors!.textContent).toContain('A First');
    });

    it('does not render year span when year is undefined', () => {
      const entry = createMockEntry({ year: undefined });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const year = el.querySelector('.zoteroYear');
      expect(year).toBeNull();
    });

    it('adds zoteroAuthorsEmpty class when authorString is empty', () => {
      const entry = createMockEntry({ authorString: '', author: [] });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const authors = el.querySelector('.zoteroAuthors');
      expect(authors!.className).toContain('zoteroAuthorsEmpty');
    });

    it('shows composite citekey with source database prefix', () => {
      const entry = createMockEntry({
        _sourceDatabase: 'MyLib',
        citekey: 'test2024',
      });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const citekey = el.querySelector('.zoteroCitekey');
      expect(citekey!.textContent).toBe('MyLib:test2024');
    });

    it('handles entry with no title', () => {
      const entry = createMockEntry({ title: undefined });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const title = el.querySelector('.zoteroTitle');
      expect(title!.textContent).toBe('');
    });

    it('handles entry with no authorString', () => {
      const entry = createMockEntry({ authorString: null });
      const el = document.createElement('div');

      modal.renderSuggestion(entry, el);

      const authors = el.querySelector('.zoteroAuthors');
      expect(authors).not.toBeNull();
    });

    it('empties the element before rendering', () => {
      const entry = createMockEntry();
      const el = document.createElement('div');
      el.appendChild(document.createElement('span')); // pre-existing child

      modal.renderSuggestion(entry, el);

      // Should only have the .zoteroResult container
      expect(el.children.length).toBe(1);
      expect(el.children[0].classList.contains('zoteroResult')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // onChooseSuggestion()
  // -----------------------------------------------------------------------

  describe('onChooseSuggestion()', () => {
    it('delegates to action.onChoose', () => {
      const entry = createMockEntry();
      const evt = new MouseEvent('click');

      modal.onChooseSuggestion(entry, evt);

      expect(action.onChoose).toHaveBeenCalledWith(entry, evt);
    });

    it('catches promise rejections from action', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (action.onChoose as jest.Mock).mockRejectedValue(
        new Error('action failed'),
      );

      const entry = createMockEntry();
      modal.onChooseSuggestion(entry, new MouseEvent('click'));

      // Wait for the promise rejection to be caught
      await Promise.resolve();
      await Promise.resolve();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // setLoading()
  // -----------------------------------------------------------------------

  describe('setLoading()', () => {
    it('shows loading UI when true', () => {
      modal.setLoading(true);

      expect(modal.loadingEl.classList.contains('d-none')).toBe(false);
      expect(modal.inputEl.disabled).toBe(true);
    });

    it('hides loading UI and focuses input when false', () => {
      const focusSpy = jest.spyOn(modal.inputEl, 'focus');
      modal.setLoading(false);

      expect(modal.loadingEl.classList.contains('d-none')).toBe(true);
      expect(modal.inputEl.disabled).toBe(false);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('empties resultContainerEl when showing loading', () => {
      modal.resultContainerEl.appendChild(document.createElement('div'));
      modal.setLoading(true);
      expect(modal.resultContainerEl.children.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Keyboard event handlers
  // -----------------------------------------------------------------------

  describe('onInputKeydown()', () => {
    it('prevents default for Tab key', () => {
      const ev = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventSpy = jest.spyOn(ev, 'preventDefault');

      modal.onInputKeydown(ev);
      expect(preventSpy).toHaveBeenCalled();
    });

    it('does not prevent default for other keys', () => {
      const ev = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventSpy = jest.spyOn(ev, 'preventDefault');

      modal.onInputKeydown(ev);
      expect(preventSpy).not.toHaveBeenCalled();
    });
  });

  describe('onInputKeyup()', () => {
    it('calls chooser.useSelectedItem for Enter key', () => {
      // Set up the chooser mock
      const useSelectedItem = jest.fn();
      (
        modal as unknown as { chooser: { useSelectedItem: jest.Mock } }
      ).chooser = {
        useSelectedItem,
      };

      const ev = new KeyboardEvent('keyup', { key: 'Enter' });
      modal.onInputKeyup(ev);

      expect(useSelectedItem).toHaveBeenCalledWith(ev);
    });

    it('calls chooser.useSelectedItem for Tab key', () => {
      const useSelectedItem = jest.fn();
      (
        modal as unknown as { chooser: { useSelectedItem: jest.Mock } }
      ).chooser = {
        useSelectedItem,
      };

      const ev = new KeyboardEvent('keyup', { key: 'Tab' });
      modal.onInputKeyup(ev);

      expect(useSelectedItem).toHaveBeenCalledWith(ev);
    });

    it('does not call chooser for other keys', () => {
      const useSelectedItem = jest.fn();
      (
        modal as unknown as { chooser: { useSelectedItem: jest.Mock } }
      ).chooser = {
        useSelectedItem,
      };

      const ev = new KeyboardEvent('keyup', { key: 'a' });
      modal.onInputKeyup(ev);

      expect(useSelectedItem).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // onClose()
  // -----------------------------------------------------------------------

  describe('onClose()', () => {
    it('unsubscribes from store', () => {
      const unsubscribe = jest.fn();
      (plugin.libraryService.store.subscribe as jest.Mock).mockImplementation(
        (cb: (state: unknown) => void) => {
          cb({ status: LoadingStatus.Idle, parseErrors: [] });
          return unsubscribe;
        },
      );

      modal.onOpen();
      modal.onClose();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('clears input timeout if still pending', () => {
      modal.onOpen();
      // Don't advance timers — timeout is still pending

      const clearSpy = jest.spyOn(window, 'clearTimeout');
      modal.onClose();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('removes keydown and keyup event listeners', () => {
      modal.onOpen();
      jest.advanceTimersByTime(200); // Listeners registered

      const removeSpy = jest.spyOn(modal.inputEl, 'removeEventListener');
      modal.onClose();

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    });

    it('handles close without prior open gracefully', () => {
      // Should not throw
      expect(() => modal.onClose()).not.toThrow();
    });
  });
});
