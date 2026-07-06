jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import {
  ReadwiseAdapter,
  ReadwiseEntryData,
  ReadwiseMode,
} from '../../../src/core/adapters/readwise-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntryData(
  overrides: Partial<ReadwiseEntryData> = {},
): ReadwiseEntryData {
  return {
    mode: 'readwise-highlights' as ReadwiseMode,
    rawId: '12345',
    title: 'Test Book Title',
    author: 'John Doe and Jane Smith',
    category: 'books',
    sourceUrl: 'https://amazon.com/book',
    readwiseUrl: 'https://readwise.io/bookreview/12345',
    coverImageUrl: 'https://img.com/cover.jpg',
    summary: 'A great book about testing.',
    highlightsText: 'This is an important highlight.\n\n---\n\nAnother one.',
    highlightCount: 2,
    tags: ['testing', 'development'],
    publishedDate: '2024-01-15',
    updatedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReadwiseAdapter', () => {
  // -------------------------------------------------------------------------
  // Source-agnostic annotations (highlights → Entry.annotations)
  // -------------------------------------------------------------------------

  describe('annotations (uniform interface)', () => {
    it('maps structured highlights into the shared Annotation shape', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({
          highlights: [
            {
              id: 'h1',
              text: 'A key sentence.',
              note: 'my thought',
              location: 42,
              locationType: 'page',
              color: 'yellow',
              highlightedAt: '2024-06-01T00:00:00Z',
              url: 'https://readwise.io/open/h1',
              tags: ['idea'],
            },
            {
              id: 'h2',
              text: 'Second one.',
              note: null,
              location: null,
              locationType: 'none',
              color: null,
              highlightedAt: null,
              url: null,
              tags: [],
            },
          ],
        }),
      );

      const anns = adapter.annotations;
      expect(anns).toHaveLength(2);
      expect(anns[0]).toMatchObject({
        id: 'h1',
        type: 'highlight',
        text: 'A key sentence.',
        comment: 'my thought',
        colorName: 'yellow',
        page: 42,
        pageLabel: '42',
        tags: ['idea'],
        openURI: 'https://readwise.io/open/h1',
        source: 'readwise',
      });
      // document order is preserved via sortIndex
      expect(anns[0].sortIndex < anns[1].sortIndex).toBe(true);
      // non-page location → no page number, empty label
      expect(anns[1].page).toBeNull();
      expect(anns[1].pageLabel).toBe('');
      expect(anns[1].comment).toBe('');
    });

    it('preserves non-page positions (value AND type) in pageLabel', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({
          highlights: [
            {
              id: 'k1',
              text: 'Kindle passage.',
              note: null,
              location: 1234,
              locationType: 'location',
              color: null,
              highlightedAt: null,
              url: null,
              tags: [],
            },
            {
              id: 'p1',
              text: 'Podcast moment.',
              note: null,
              location: 90,
              locationType: 'time_offset',
              color: null,
              highlightedAt: null,
              url: null,
              tags: [],
            },
          ],
        }),
      );

      const anns = adapter.annotations;
      // A Kindle/podcast position is not a page: page stays null, but the
      // value and its type survive in pageLabel (the removed entry.highlights
      // surface exposed this — dropping it silently would lose the position).
      expect(anns[0].page).toBeNull();
      expect(anns[0].pageLabel).toBe('location 1234');
      expect(anns[1].page).toBeNull();
      expect(anns[1].pageLabel).toBe('time_offset 90');
    });

    it('yields [] for an entry with no highlights (template skips)', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ highlights: [] }));
      expect(adapter.annotations).toEqual([]);
      expect(adapter.toTemplateContext().annotationCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Constructor & Identity
  // -------------------------------------------------------------------------

  describe('constructor and identity', () => {
    it('creates an adapter from entry data', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      expect(adapter).toBeDefined();
      expect(adapter.title).toBe('Test Book Title');
    });

    it('generates citekey with rw- prefix for readwise-highlights mode', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ mode: 'readwise-highlights', rawId: '42' }),
      );
      expect(adapter.citekey).toBe('rw-42');
      expect(adapter.id).toBe('rw-42');
    });

    it('generates citekey with rd- prefix for reader-documents mode', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ mode: 'reader-documents', rawId: 'abc-123' }),
      );
      expect(adapter.citekey).toBe('rd-abc-123');
      expect(adapter.id).toBe('rd-abc-123');
    });

    it('allows mutable id via setter', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ rawId: '99' }));
      expect(adapter.id).toBe('rw-99');

      adapter.id = 'custom-id';
      expect(adapter.id).toBe('custom-id');
      // citekey should remain unchanged
      expect(adapter.citekey).toBe('rw-99');
    });
  });

  // -------------------------------------------------------------------------
  // Type mapping
  // -------------------------------------------------------------------------

  describe('type mapping', () => {
    const cases: Array<[string, string]> = [
      ['books', 'book'],
      ['articles', 'article'],
      ['tweets', 'webpage'],
      ['podcasts', 'speech'],
      ['supplementals', 'document'],
      ['email', 'letter'],
      ['pdf', 'document'],
      ['epub', 'book'],
      ['rss', 'article'],
      ['video', 'motion_picture'],
      ['highlight', 'entry'],
      ['note', 'entry'],
      ['article', 'article'],
      ['unknown_category', 'document'],
    ];

    it.each(cases)('maps category "%s" to type "%s"', (category, expected) => {
      const adapter = new ReadwiseAdapter(makeEntryData({ category }));
      expect(adapter.type).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Author parsing
  // -------------------------------------------------------------------------

  describe('author parsing', () => {
    it('parses "FirstName LastName and FirstName LastName" format', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ author: 'John Doe and Jane Smith' }),
      );
      expect(adapter.author).toEqual([
        { given: 'John', family: 'Doe' },
        { given: 'Jane', family: 'Smith' },
      ]);
    });

    it('parses comma-separated authors', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ author: 'John Doe, Jane Smith' }),
      );
      expect(adapter.author).toEqual([
        { given: 'John', family: 'Doe' },
        { given: 'Jane', family: 'Smith' },
      ]);
    });

    it('handles single name as literal', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ author: 'Aristotle' }),
      );
      expect(adapter.author).toEqual([{ literal: 'Aristotle' }]);
    });

    it('returns undefined for empty author', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ author: '' }));
      expect(adapter.author).toBeUndefined();
    });

    it('returns raw author string as authorString', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ author: 'John Doe and Jane Smith' }),
      );
      expect(adapter.authorString).toBe('John Doe and Jane Smith');
    });

    it('returns null authorString for empty author', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ author: '' }));
      expect(adapter.authorString).toBeNull();
    });

    it('handles multi-word given names', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ author: 'Mary Jane Watson' }),
      );
      expect(adapter.author).toEqual([
        { given: 'Mary Jane', family: 'Watson' },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Field mapping
  // -------------------------------------------------------------------------

  describe('field mapping', () => {
    it('maps summary to abstract', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ summary: 'Test summary' }),
      );
      expect(adapter.abstract).toBe('Test summary');
    });

    it('returns undefined abstract when summary is null', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ summary: null }));
      expect(adapter.abstract).toBeUndefined();
    });

    it('maps sourceUrl to URL', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ sourceUrl: 'https://example.com' }),
      );
      expect(adapter.URL).toBe('https://example.com');
    });

    it('returns undefined URL when sourceUrl is null', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ sourceUrl: null }));
      expect(adapter.URL).toBeUndefined();
    });

    it('maps tags to keywords', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ tags: ['science', 'ai'] }),
      );
      expect(adapter.keywords).toEqual(['science', 'ai']);
    });

    it('returns undefined keywords when tags is empty', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ tags: [] }));
      expect(adapter.keywords).toBeUndefined();
    });

    it('maps publishedDate to issuedDate', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ publishedDate: '2024-01-15' }),
      );
      expect(adapter.issuedDate).toBeInstanceOf(Date);
      expect(adapter.issuedDate?.toISOString()).toContain('2024-01-15');
    });

    it('returns null issuedDate when publishedDate is null', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ publishedDate: null }),
      );
      expect(adapter.issuedDate).toBeNull();
    });

    it('returns null issuedDate for invalid date string', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ publishedDate: 'not-a-date' }),
      );
      expect(adapter.issuedDate).toBeNull();
    });

    it('maps title correctly', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ title: 'My Great Book' }),
      );
      expect(adapter.title).toBe('My Great Book');
    });

    it('returns undefined title for empty string', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ title: '' }));
      expect(adapter.title).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Undefined fields (fields not available from Readwise)
  // -------------------------------------------------------------------------

  describe('unavailable fields', () => {
    let adapter: ReadwiseAdapter;

    beforeEach(() => {
      adapter = new ReadwiseAdapter(makeEntryData());
    });

    it('returns undefined for containerTitle', () => {
      expect(adapter.containerTitle).toBeUndefined();
    });

    it('returns undefined for DOI', () => {
      expect(adapter.DOI).toBeUndefined();
    });

    it('returns undefined for ISBN', () => {
      expect(adapter.ISBN).toBeUndefined();
    });

    it('returns undefined for page', () => {
      expect(adapter.page).toBeUndefined();
    });

    it('returns undefined for titleShort', () => {
      expect(adapter.titleShort).toBeUndefined();
    });

    it('returns undefined for publisher', () => {
      expect(adapter.publisher).toBeUndefined();
    });

    it('returns undefined for publisherPlace', () => {
      expect(adapter.publisherPlace).toBeUndefined();
    });

    it('returns undefined for eventPlace', () => {
      expect(adapter.eventPlace).toBeUndefined();
    });

    it('returns undefined for language', () => {
      expect(adapter.language).toBeUndefined();
    });

    it('returns undefined for source', () => {
      expect(adapter.source).toBeUndefined();
    });

    it('returns undefined for zoteroId', () => {
      expect(adapter.zoteroId).toBeUndefined();
    });

    it('returns undefined for series', () => {
      expect(adapter.series).toBeUndefined();
    });

    it('returns undefined for volume', () => {
      expect(adapter.volume).toBeUndefined();
    });

    it('returns null for eprint', () => {
      expect(adapter.eprint).toBeNull();
    });

    it('returns null for eprinttype', () => {
      expect(adapter.eprinttype).toBeNull();
    });

    it('returns null for files', () => {
      expect(adapter.files).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Readwise-specific getters
  // -------------------------------------------------------------------------

  describe('Readwise-specific getters', () => {
    it('returns readwiseUrl', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ readwiseUrl: 'https://readwise.io/book/1' }),
      );
      expect(adapter.readwiseUrl).toBe('https://readwise.io/book/1');
    });

    it('returns coverImageUrl', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ coverImageUrl: 'https://img.com/cover.jpg' }),
      );
      expect(adapter.coverImageUrl).toBe('https://img.com/cover.jpg');
    });

    it('returns null coverImageUrl when not available', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ coverImageUrl: null }),
      );
      expect(adapter.coverImageUrl).toBeNull();
    });

    it('returns highlightCount', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ highlightCount: 42 }),
      );
      expect(adapter.highlightCount).toBe(42);
    });

    it('returns category', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ category: 'podcasts' }),
      );
      expect(adapter.category).toBe('podcasts');
    });
  });

  // -------------------------------------------------------------------------
  // zoteroSelectURI override
  // -------------------------------------------------------------------------

  describe('extended field mappings', () => {
    it('maps readable_title to titleShort', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ readableTitle: 'Short Title' }),
      );
      expect(adapter.titleShort).toBe('Short Title');
    });

    it('maps source (e.g. kindle) to source', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ source: 'kindle' }));
      expect(adapter.source).toBe('kindle');
    });

    it('maps asin to the asin getter and leaves ISBN empty', () => {
      const adapter = new ReadwiseAdapter(makeEntryData({ asin: 'B0012345' }));
      expect(adapter.asin).toBe('B0012345');
      // ASIN is not an ISBN, so the ISBN field must stay empty.
      expect(adapter.ISBN).toBeUndefined();
    });

    it('maps siteName to containerTitle', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ siteName: 'The New Yorker' }),
      );
      expect(adapter.containerTitle).toBe('The New Yorker');
    });

    it('exposes documentNote, wordCount, readingProgress and readerLocation', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({
          documentNote: 'My doc note',
          wordCount: 1234,
          readingProgress: 0.42,
          readerLocation: 'later',
        }),
      );
      expect(adapter.documentNote).toBe('My doc note');
      expect(adapter.wordCount).toBe(1234);
      expect(adapter.readingProgress).toBe(0.42);
      expect(adapter.readerLocation).toBe('later');
    });

    it('falls back to undefined/null when the extended fields are absent', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      expect(adapter.titleShort).toBeUndefined();
      expect(adapter.source).toBeUndefined();
      expect(adapter.asin).toBeUndefined();
      expect(adapter.ISBN).toBeUndefined();
      expect(adapter.containerTitle).toBeUndefined();
      expect(adapter.documentNote).toBeNull();
      expect(adapter.wordCount).toBeNull();
      expect(adapter.readingProgress).toBeNull();
      expect(adapter.readerLocation).toBeNull();
    });
  });

  describe('structured highlights via the uniform annotations interface', () => {
    // There is deliberately NO separate `entry.highlights` template surface:
    // highlights are exposed only through the source-agnostic `annotations`
    // interface shared with Zotero (and any future source).
    it('exposes highlight data through annotations', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({
          highlights: [
            {
              id: 'h1',
              text: 'first highlight',
              note: 'a note',
              location: 12,
              locationType: 'page',
              color: 'yellow',
              highlightedAt: '2024-01-01T00:00:00Z',
              url: null,
              tags: ['tag1'],
            },
          ],
        }),
      );
      expect(adapter.annotations).toHaveLength(1);
      expect(adapter.annotations[0].text).toBe('first highlight');
      expect(adapter.annotations[0].comment).toBe('a note');
    });

    it('returns an empty array when highlights are absent (backward-compat)', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      expect(adapter.annotations).toEqual([]);
    });

    it('exposes annotations via toJSON for {{entry.annotations}}', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({
          highlights: [
            {
              id: 'h1',
              text: 'text',
              note: null,
              location: null,
              locationType: null,
              color: null,
              highlightedAt: null,
              url: null,
              tags: [],
            },
          ],
        }),
      );
      const json = adapter.toJSON();
      expect(Array.isArray(json.annotations)).toBe(true);
      expect((json.annotations as unknown[]).length).toBe(1);
      // No duplicate surface: the raw highlights array is not re-exported.
      expect(json.highlights).toBeUndefined();
    });
  });

  describe('zoteroSelectURI override', () => {
    it('returns readwiseUrl instead of zotero:// URI', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ readwiseUrl: 'https://readwise.io/book/1' }),
      );
      expect(adapter.zoteroSelectURI).toBe('https://readwise.io/book/1');
    });
  });

  // -------------------------------------------------------------------------
  // Notes / highlights
  // -------------------------------------------------------------------------

  describe('notes (highlights)', () => {
    it('sets _note from highlightsText', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ highlightsText: 'Highlight A\n\n---\n\nHighlight B' }),
      );
      expect(adapter.note).toBe('Highlight A\n\n---\n\nHighlight B');
    });

    it('returns empty string when no highlights', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ highlightsText: null }),
      );
      expect(adapter.note).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Domain methods from Entry base class
  // -------------------------------------------------------------------------

  describe('inherited domain methods', () => {
    it('toTemplateContext returns all expected fields', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      const ctx = adapter.toTemplateContext();

      expect(ctx.citekey).toBe('rw-12345');
      expect(ctx.title).toBe('Test Book Title');
      expect(ctx.authorString).toBe('John Doe and Jane Smith');
      expect(ctx.abstract).toBe('A great book about testing.');
      expect(ctx.type).toBe('book');
      expect(ctx.URL).toBe('https://amazon.com/book');
      expect(ctx.zoteroSelectURI).toBe('https://readwise.io/bookreview/12345');
      expect(ctx.keywords).toEqual(['testing', 'development']);
      expect(ctx.entry).toBeDefined();
    });

    it('toJSON includes all getters', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      const json = adapter.toJSON();

      expect(json.citekey).toBe('rw-12345');
      expect(json.readwiseUrl).toBe('https://readwise.io/bookreview/12345');
      expect(json.highlightCount).toBe(2);
      expect(json.category).toBe('books');
    });

    it('toSearchDocument returns correct fields', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      const doc = adapter.toSearchDocument();

      expect(doc.id).toBe('rw-12345');
      expect(doc.title).toBe('Test Book Title');
      expect(doc.authorString).toBe('John Doe and Jane Smith');
    });

    it('displayKey returns citekey when no sourceDatabase', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      expect(adapter.displayKey()).toBe('rw-12345');
    });

    it('displayKey includes sourceDatabase prefix', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      adapter._sourceDatabase = 'Readwise';
      expect(adapter.displayKey()).toBe('Readwise:rw-12345');
    });

    it('yearString returns year from published date', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ publishedDate: '2024-01-15' }),
      );
      expect(adapter.yearString()).toBe('2024');
    });

    it('yearString returns empty string when no date', () => {
      const adapter = new ReadwiseAdapter(
        makeEntryData({ publishedDate: null }),
      );
      expect(adapter.yearString()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Mutable properties for NormalizationPipeline
  // -------------------------------------------------------------------------

  describe('mutable properties for pipeline', () => {
    it('_sourceDatabase is initially undefined', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      expect(adapter._sourceDatabase).toBeUndefined();
    });

    it('_compositeCitekey is initially undefined', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      expect(adapter._compositeCitekey).toBeUndefined();
    });

    it('allows setting _sourceDatabase', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      adapter._sourceDatabase = 'MyReadwise';
      expect(adapter._sourceDatabase).toBe('MyReadwise');
    });

    it('allows setting _compositeCitekey', () => {
      const adapter = new ReadwiseAdapter(makeEntryData());
      adapter._compositeCitekey = 'rw-12345@db-1';
      expect(adapter._compositeCitekey).toBe('rw-12345@db-1');
    });
  });
});
