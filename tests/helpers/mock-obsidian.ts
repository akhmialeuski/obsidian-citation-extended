/**
 * Shared Obsidian mock for all tests that need the 'obsidian' module.
 *
 * Usage: import this file at the top of your test, or use the jest.mock
 * block below as a template.
 *
 * This centralizes the mock so that changes to the obsidian API stubs
 * propagate to all tests automatically.
 */

/** Reusable obsidian mock factory for jest.mock() */
export const OBSIDIAN_MOCK = {
  App: class {},
  Plugin: class {
    addCommand() {}
    addStatusBarItem() {
      return {
        setText: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn(),
      };
    }
  },
  PluginSettingTab: class {},
  Setting: class {
    setName() {
      return this;
    }
    setDesc() {
      return this;
    }
    setHeading() {
      return this;
    }
    addText() {
      return this;
    }
    addTextArea() {
      return this;
    }
    addToggle() {
      return this;
    }
    addDropdown() {
      return this;
    }
    addButton() {
      return this;
    }
    addExtraButton() {
      return this;
    }
  },
  Notice: jest.fn(),
  MarkdownView: class {},
  FileSystemAdapter: class {
    getBasePath() {
      return '/mock/vault';
    }
    static readLocalFile = jest.fn().mockResolvedValue(new ArrayBuffer(0));
  },
  TFile: class {
    path = '';
    name = '';
  },
  TFolder: class {
    path = '';
  },
  normalizePath: (p: string) => p,
  debounce: (fn: (...args: unknown[]) => void) => fn,
  Events: class {
    on() {}
    off() {}
    trigger() {}
  },
};

/**
 * Helper to create a mock Entry for tests.
 * Provides sensible defaults that can be overridden.
 */
export function createMockEntry(overrides: Record<string, unknown> = {}) {
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
    abstract: 'Test abstract text.',
    page: '1-10',
    publisher: 'Test Publisher',
    publisherPlace: 'Test City',
    issuedDate: new Date('2024-01-15'),
    zoteroSelectURI: 'zotero://select/items/@test2024',
    language: 'en',
    source: 'Test Source',
    note: '',
    keywords: ['testing', 'mock'],
    eprint: null,
    eprinttype: null,
    eventPlace: null,
    series: null,
    volume: '1',
    ISBN: null,
    _sourceDatabase: undefined,
    _compositeCitekey: undefined,
    get citekey(): string {
      return String(this.id);
    },
    toJSON() {
      return { ...this };
    },
    ...overrides,
  };
}

/**
 * Helper to create a mock DataSource for library tests.
 */
export function createMockDataSource(
  id: string,
  entries: unknown[] = [],
  options: { throwOnLoad?: boolean; loadDelay?: number } = {},
) {
  return {
    id,
    load: jest.fn().mockImplementation(async () => {
      if (options.loadDelay) {
        await new Promise((resolve) => setTimeout(resolve, options.loadDelay));
      }
      if (options.throwOnLoad) {
        throw new Error(`Source ${id} failed to load`);
      }
      return {
        sourceId: id,
        entries,
        modifiedAt: new Date(),
      };
    }),
    watch: jest.fn(),
    dispose: jest.fn(),
  };
}
