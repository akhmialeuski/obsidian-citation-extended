/**
 * Shared Obsidian mock for all tests that need the 'obsidian' module.
 *
 * Usage: import this file at the top of your test, or use the jest.mock
 * block below as a template.
 *
 * This centralizes the mock so that changes to the obsidian API stubs
 * propagate to all tests automatically.
 */

import { Entry, Author } from '../../src/core/types/entry';

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
 * Concrete Entry subclass for tests. Provides sensible defaults that can
 * be overridden via the constructor. All domain methods defined on the
 * Entry base class (toTemplateContext, displayKey, displayAuthors, etc.)
 * are inherited and work correctly.
 */
export class TestEntry extends Entry {
  id: string;
  type: string;
  abstract?: string;
  author?: Author[];
  authorString?: string | null;
  containerTitle?: string;
  DOI?: string;
  files?: string[] | null;
  issuedDate?: Date | null;
  page?: string;
  title?: string;
  titleShort?: string;
  URL?: string;
  zoteroId?: string;
  keywords?: string[];
  eventPlace?: string;
  language?: string;
  source?: string;
  publisher?: string;
  publisherPlace?: string;
  ISBN?: string;
  series?: string;
  volume?: string;
  _sourceDatabase?: string;
  _compositeCitekey?: string;
  eprint?: string | null;
  eprinttype?: string | null;

  constructor(overrides: Record<string, unknown> = {}) {
    super();
    this.id = 'test2024';
    this.type = 'article-journal';
    this.title = 'Test Article';
    this.titleShort = 'Test';
    this.authorString = 'John Doe, Jane Smith';
    this.author = [
      { given: 'John', family: 'Doe' },
      { given: 'Jane', family: 'Smith' },
    ];
    this.containerTitle = 'Test Journal';
    this.DOI = '10.1234/test';
    this.URL = 'https://example.com';
    this.abstract = 'Test abstract text.';
    this.page = '1-10';
    this.publisher = 'Test Publisher';
    this.publisherPlace = 'Test City';
    this.issuedDate = new Date('2024-01-15');
    this.language = 'en';
    this.source = 'Test Source';
    this.keywords = ['testing', 'mock'];
    this.eprint = null;
    this.eprinttype = null;
    this.eventPlace = undefined;
    this.series = undefined;
    this.volume = '1';
    this.ISBN = undefined;
    this.zoteroId = undefined;
    this.files = null;
    this._sourceDatabase = undefined;
    this._compositeCitekey = undefined;

    // Apply overrides (must be after defaults for proper order)
    Object.assign(this, overrides);
  }

  get citekey(): string {
    return this.id;
  }

  get year(): number | undefined {
    if (this._year) return parseInt(this._year);
    return this.issuedDate?.getUTCFullYear();
  }
}

/**
 * Helper to create a mock Entry for tests.
 * Returns a proper Entry subclass instance so all domain methods
 * (toTemplateContext, displayKey, displayAuthors, etc.) work correctly.
 */
export function createMockEntry(
  overrides: Record<string, unknown> = {},
): TestEntry {
  return new TestEntry(overrides);
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
