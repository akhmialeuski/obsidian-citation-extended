import { TestEntry } from '../helpers/mock-obsidian';

jest.mock('obsidian', () => ({}), { virtual: true });

describe('Entry domain methods', () => {
  describe('yearString()', () => {
    it('returns year as string when issuedDate is set', () => {
      const entry = new TestEntry({ issuedDate: new Date('2023-06-15') });
      expect(entry.yearString()).toBe('2023');
    });

    it('returns empty string when no date is available', () => {
      const entry = new TestEntry({ issuedDate: null });
      expect(entry.yearString()).toBe('');
    });

    it('returns year from _year field when set', () => {
      const entry = new TestEntry({ issuedDate: null });
      // Access protected _year via any
      (entry as unknown as Record<string, unknown>)['_year'] = '2019';
      expect(entry.yearString()).toBe('2019');
    });
  });

  describe('dateString()', () => {
    it('returns ISO date string when issuedDate is set', () => {
      const entry = new TestEntry({
        issuedDate: new Date('2023-06-15T12:00:00Z'),
      });
      expect(entry.dateString()).toBe('2023-06-15');
    });

    it('returns null when issuedDate is null', () => {
      const entry = new TestEntry({ issuedDate: null });
      expect(entry.dateString()).toBeNull();
    });

    it('returns null when issuedDate is undefined', () => {
      const entry = new TestEntry({ issuedDate: undefined });
      expect(entry.dateString()).toBeNull();
    });
  });

  describe('lastname()', () => {
    it('returns first author family name', () => {
      const entry = new TestEntry({
        author: [
          { given: 'John', family: 'Doe' },
          { given: 'Jane', family: 'Smith' },
        ],
      });
      expect(entry.lastname()).toBe('Doe');
    });

    it('returns literal name when family is absent', () => {
      const entry = new TestEntry({
        author: [{ literal: 'UNESCO' }],
      });
      expect(entry.lastname()).toBe('UNESCO');
    });

    it('returns undefined when no authors', () => {
      const entry = new TestEntry({ author: undefined });
      expect(entry.lastname()).toBeUndefined();
    });

    it('returns undefined when author array is empty', () => {
      const entry = new TestEntry({ author: [] });
      expect(entry.lastname()).toBeUndefined();
    });
  });

  describe('displayAuthors()', () => {
    it('returns full authorString when no maxCount', () => {
      const entry = new TestEntry({
        authorString: 'John Doe, Jane Smith',
        author: [
          { given: 'John', family: 'Doe' },
          { given: 'Jane', family: 'Smith' },
        ],
      });
      expect(entry.displayAuthors()).toBe('John Doe, Jane Smith');
    });

    it('returns full authorString when count is within maxCount', () => {
      const entry = new TestEntry({
        authorString: 'John Doe, Jane Smith',
        author: [
          { given: 'John', family: 'Doe' },
          { given: 'Jane', family: 'Smith' },
        ],
      });
      expect(entry.displayAuthors(3)).toBe('John Doe, Jane Smith');
    });

    it('truncates with et al. when authors exceed maxCount', () => {
      const entry = new TestEntry({
        authorString: 'A First, B Second, C Third, D Fourth',
        author: [
          { given: 'A', family: 'First' },
          { given: 'B', family: 'Second' },
          { given: 'C', family: 'Third' },
          { given: 'D', family: 'Fourth' },
        ],
      });
      expect(entry.displayAuthors(3)).toBe('A First, B Second, C Third et al.');
    });

    it('returns empty string when no authorString', () => {
      const entry = new TestEntry({
        authorString: null,
        author: undefined,
      });
      expect(entry.displayAuthors()).toBe('');
    });

    it('handles maxCount of 0 same as no maxCount', () => {
      const entry = new TestEntry({
        authorString: 'John Doe',
        author: [{ given: 'John', family: 'Doe' }],
      });
      expect(entry.displayAuthors(0)).toBe('John Doe');
    });
  });

  describe('displayKey()', () => {
    it('returns citekey when no source database', () => {
      const entry = new TestEntry({
        id: 'doe2023',
        _sourceDatabase: undefined,
      });
      expect(entry.displayKey()).toBe('doe2023');
    });

    it('returns prefixed key when source database is set', () => {
      const entry = new TestEntry({
        id: 'doe2023',
        _sourceDatabase: 'Zotero',
      });
      expect(entry.displayKey()).toBe('Zotero:doe2023');
    });
  });

  describe('toSearchDocument()', () => {
    it('returns a flat search document with string fields', () => {
      const entry = new TestEntry({
        id: 'doe2023',
        title: 'My Paper',
        authorString: 'John Doe',
        issuedDate: new Date('2023-01-01'),
        zoteroId: 'Z123',
      });

      const doc = entry.toSearchDocument();
      expect(doc).toEqual({
        id: 'doe2023',
        title: 'My Paper',
        authorString: 'John Doe',
        year: '2023',
        zoteroId: 'Z123',
      });
    });

    it('uses empty strings for missing fields', () => {
      const entry = new TestEntry({
        id: 'bare',
        title: undefined,
        authorString: null,
        issuedDate: null,
        zoteroId: undefined,
      });

      const doc = entry.toSearchDocument();
      expect(doc).toEqual({
        id: 'bare',
        title: '',
        authorString: '',
        year: '',
        zoteroId: '',
      });
    });
  });

  describe('toTemplateContext()', () => {
    it('returns all template shortcut fields', () => {
      const entry = new TestEntry({
        id: 'doe2023',
        title: 'My Paper',
        authorString: 'John Doe',
        author: [{ given: 'John', family: 'Doe' }],
        issuedDate: new Date('2023-06-15T00:00:00Z'),
        DOI: '10.1234/test',
        URL: 'https://example.com',
        containerTitle: 'Journal',
        page: '1-10',
        publisher: 'Publisher',
        publisherPlace: 'City',
        language: 'en',
        source: 'Source',
        keywords: ['test'],
        series: 'Series',
        volume: '1',
        ISBN: '123',
        eprint: '1234',
        eprinttype: 'arxiv',
        eventPlace: 'Place',
        abstract: 'Abstract text.',
        titleShort: 'MP',
        type: 'article-journal',
        zoteroId: 'Z123',
      });

      const ctx = entry.toTemplateContext();

      expect(ctx.citekey).toBe('doe2023');
      expect(ctx.title).toBe('My Paper');
      expect(ctx.authorString).toBe('John Doe');
      expect(ctx.lastname).toBe('Doe');
      expect(ctx.year).toBe('2023');
      expect(ctx.date).toBe('2023-06-15');
      expect(ctx.DOI).toBe('10.1234/test');
      expect(ctx.URL).toBe('https://example.com');
      expect(ctx.containerTitle).toBe('Journal');
      expect(ctx.page).toBe('1-10');
      expect(ctx.publisher).toBe('Publisher');
      expect(ctx.publisherPlace).toBe('City');
      expect(ctx.language).toBe('en');
      expect(ctx.source).toBe('Source');
      expect(ctx.keywords).toEqual(['test']);
      expect(ctx.series).toBe('Series');
      expect(ctx.volume).toBe('1');
      expect(ctx.ISBN).toBe('123');
      expect(ctx.eprint).toBe('1234');
      expect(ctx.eprinttype).toBe('arxiv');
      expect(ctx.eventPlace).toBe('Place');
      expect(ctx.abstract).toBe('Abstract text.');
      expect(ctx.titleShort).toBe('MP');
      expect(ctx.type).toBe('article-journal');
      expect(ctx.zoteroId).toBe('Z123');
      expect(ctx.zoteroSelectURI).toBe('zotero://select/items/@doe2023');
      expect(ctx.entry).toBeDefined();
      expect(ctx.selectedText).toBeUndefined();
    });

    it('passes selectedText via extras', () => {
      const entry = new TestEntry({ id: 'doe2023' });
      const ctx = entry.toTemplateContext({
        selectedText: 'highlighted text',
      });
      expect(ctx.selectedText).toBe('highlighted text');
    });

    it('includes the full entry object for advanced templates', () => {
      const entry = new TestEntry({ id: 'test' });
      const ctx = entry.toTemplateContext();
      expect(typeof ctx.entry).toBe('object');
      // entry should contain at least the id
      expect(ctx.entry.id).toBe('test');
    });

    it('handles missing optional fields gracefully', () => {
      const entry = new TestEntry({
        id: 'bare',
        type: 'misc',
        title: undefined,
        authorString: null,
        author: undefined,
        issuedDate: null,
        DOI: undefined,
        URL: undefined,
        zoteroId: undefined,
      });

      const ctx = entry.toTemplateContext();
      expect(ctx.citekey).toBe('bare');
      expect(ctx.type).toBe('misc');
      expect(ctx.title).toBeUndefined();
      expect(ctx.authorString).toBeNull();
      expect(ctx.lastname).toBeUndefined();
      expect(ctx.year).toBeUndefined();
      expect(ctx.date).toBeNull();
    });
  });
});
