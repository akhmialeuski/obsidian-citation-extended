/**
 * @jest-environment jsdom
 *
 * jsdom provides `window`, matching Obsidian's Electron renderer. The polling
 * timer in ReadwiseSource.watch() uses `window.setInterval`.
 */
jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import {
  ReadwiseSource,
  applyReadwiseFilters,
} from '../../src/sources/readwise-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from '../../src/core/readwise/readwise-api-client';
import {
  ReadwiseAdapter,
  ReadwiseEntryData,
} from '../../src/core/adapters/readwise-adapter';
import { DATABASE_FORMATS } from '../../src/core/types/database';
import type { IFileSystem } from '../../src/platform/platform-adapter';
import { createMockPlatformAdapter } from '../helpers/mock-platform';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExportBook(
  overrides: Partial<ReadwiseExportBook> = {},
): ReadwiseExportBook {
  return {
    user_book_id: 1,
    title: 'Test Book',
    author: 'Test Author',
    readable_title: 'Test Book',
    source: 'kindle',
    cover_image_url: 'https://img.com/cover.jpg',
    unique_url: null,
    book_tags: [{ name: 'science' }],
    category: 'books',
    readwise_url: 'https://readwise.io/bookreview/1',
    source_url: 'https://amazon.com/book',
    asin: 'B001234',
    highlights: [
      {
        id: 10,
        text: 'highlight text',
        note: 'my note',
        location: 100,
        location_type: 'page',
        highlighted_at: '2024-01-01T00:00:00Z',
        url: null,
        color: 'yellow',
        updated: '2024-06-01T00:00:00Z',
        book_id: 1,
        tags: [{ name: 'important' }],
      },
    ],
    document_note: null,
    summary: 'A great book',
    num_highlights: 1,
    ...overrides,
  };
}

function makeReaderDoc(
  overrides: Partial<ReadwiseReaderDocument> = {},
): ReadwiseReaderDocument {
  return {
    id: 'doc-abc',
    url: 'https://readwise.io/reader/doc-abc',
    source_url: 'https://example.com/article',
    title: 'Test Article',
    author: 'Jane Doe',
    source: 'web',
    category: 'article',
    location: 'new',
    tags: { science: {}, ai: {} },
    site_name: 'Example',
    word_count: 2000,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    published_date: '2024-01-15',
    summary: 'An interesting article',
    image_url: 'https://img.com/article.jpg',
    content: 'Article content',
    html: '<p>Article content</p>',
    parent_id: null,
    reading_progress: 0.5,
    notes: 'Some notes',
    ...overrides,
  };
}

function makeReadwiseEntryData(
  overrides: Partial<ReadwiseEntryData> = {},
): ReadwiseEntryData {
  return {
    mode: 'readwise-highlights',
    rawId: '1',
    title: 'T',
    author: 'A',
    category: 'books',
    sourceUrl: null,
    readwiseUrl: 'https://readwise.io/x',
    coverImageUrl: null,
    summary: null,
    highlightsText: null,
    highlightCount: 0,
    tags: [],
    publishedDate: null,
    updatedAt: null,
    ...overrides,
  };
}

function createMockClient(
  overrides: Partial<ReadwiseApiClient> = {},
): ReadwiseApiClient {
  return {
    validateToken: jest.fn().mockResolvedValue(true),
    fetchExportBooks: jest.fn().mockResolvedValue([]),
    fetchReaderDocuments: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ReadwiseApiClient;
}

function createMockFileSystem(
  overrides: Partial<IFileSystem> = {},
): IFileSystem {
  // Reuse the shared platform-adapter mock's fileSystem (tests/helpers/
  // mock-platform.ts) rather than duplicating the mock factory here.
  const fileSystem = createMockPlatformAdapter().fileSystem;
  return { ...fileSystem, ...overrides };
}

/** Create a mock WorkerManager that returns the data passed to it. */
function createMockWorkerManager() {
  return {
    post: jest
      .fn()
      .mockImplementation(
        (msg: { databaseRaw: string; databaseType: string }) => {
          const entries = JSON.parse(msg.databaseRaw);
          return Promise.resolve({ entries, parseErrors: [] });
        },
      ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReadwiseSource', () => {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('creates a source with the given id', () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource('rw-src-1', client, worker as never);
      expect(source.id).toBe('rw-src-1');
    });
  });

  // -------------------------------------------------------------------------
  // load() — merged behavior (both APIs fetched in parallel)
  // -------------------------------------------------------------------------

  describe('load (merged behavior)', () => {
    it('loads books from v2 API and converts to ReadwiseAdapter entries', async () => {
      const books = [
        makeExportBook({ user_book_id: 1, title: 'Book 1' }),
        makeExportBook({ user_book_id: 2, title: 'Book 2' }),
      ];
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue(books),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rw-src-1', client, worker as never);
      const result = await source.load();

      expect(result.sourceId).toBe('rw-src-1');
      // Both books should appear as entries (reader docs return empty)
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toBeInstanceOf(ReadwiseAdapter);
      expect(result.entries[0].id).toBe('rw-1');
      expect(result.entries[1].id).toBe('rw-2');
      expect(result.modifiedAt).toBeInstanceOf(Date);
    });

    it('loads documents from v3 API and converts to ReadwiseAdapter entries', async () => {
      const docs = [
        makeReaderDoc({ id: 'doc-1', title: 'Article 1' }),
        makeReaderDoc({ id: 'doc-2', title: 'Article 2' }),
      ];
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue(docs),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rd-src-1', client, worker as never);
      const result = await source.load();

      expect(result.sourceId).toBe('rd-src-1');
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toBeInstanceOf(ReadwiseAdapter);
      expect(result.entries[0].id).toBe('rd-doc-1');
      expect(result.entries[1].id).toBe('rd-doc-2');
    });

    it('merges results from both APIs', async () => {
      const books = [makeExportBook({ user_book_id: 1, title: 'Book 1' })];
      const docs = [makeReaderDoc({ id: 'doc-1', title: 'Article 1' })];
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue(books),
        fetchReaderDocuments: jest.fn().mockResolvedValue(docs),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rw-src-1', client, worker as never);
      const result = await source.load();

      // Both the book and the document should appear
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe('rw-1');
      expect(result.entries[1].id).toBe('rd-doc-1');
    });

    it('posts serialized entry data to the worker', async () => {
      const books = [makeExportBook({ user_book_id: 1 })];
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue(books),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      await source.load();

      expect(worker.post).toHaveBeenCalledTimes(1);
      const call = worker.post.mock.calls[0][0];
      expect(call.databaseType).toBe(DATABASE_FORMATS.Readwise);
      expect(typeof call.databaseRaw).toBe('string');
      // Verify the raw data is valid JSON containing the entry
      const parsed = JSON.parse(call.databaseRaw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].rawId).toBe('1');
    });

    it('converts book fields to entry data correctly', async () => {
      const book = makeExportBook({
        user_book_id: 42,
        title: 'Deep Work',
        author: 'Cal Newport',
        category: 'books',
        source_url: 'https://amazon.com/deep-work',
        readwise_url: 'https://readwise.io/bookreview/42',
        summary: 'Focus is important',
        book_tags: [{ name: 'productivity' }],
        num_highlights: 5,
        highlights: [
          {
            id: 1,
            text: 'Focus on hard things',
            note: '',
            location: 10,
            location_type: 'page',
            highlighted_at: null,
            url: null,
            color: 'yellow',
            updated: '2024-03-01T00:00:00Z',
            book_id: 42,
            tags: [],
          },
          {
            id: 2,
            text: 'Eliminate distractions',
            note: '',
            location: 20,
            location_type: 'page',
            highlighted_at: null,
            url: null,
            color: 'blue',
            updated: '2024-04-01T00:00:00Z',
            book_id: 42,
            tags: [],
          },
        ],
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();
      const entry = result.entries[0];

      expect(entry.id).toBe('rw-42');
      expect(entry.title).toBe('Deep Work');
      expect(entry.type).toBe('book');
      expect(entry.URL).toBe('https://amazon.com/deep-work');
      expect(entry.abstract).toBe('Focus is important');
      expect(entry.keywords).toEqual(['productivity']);
      expect(entry.note).toContain('Focus on hard things');
      expect(entry.note).toContain('Eliminate distractions');
    });

    it('prefers unique_url over readwise_url for v2 book readwiseUrl', async () => {
      const book = makeExportBook({
        unique_url: 'https://readwise.io/reader/document_raw_id/1',
        readwise_url: 'https://readwise.io/bookreview/1',
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      // The entry data's readwiseUrl should use unique_url when available
      const raw = JSON.parse(
        (worker.post.mock.calls[0][0] as { databaseRaw: string }).databaseRaw,
      );
      expect(raw[0].readwiseUrl).toBe(
        'https://readwise.io/reader/document_raw_id/1',
      );
      expect(result.entries).toHaveLength(1);
    });

    it('falls back to readwise_url when unique_url is null', async () => {
      const book = makeExportBook({
        unique_url: null,
        readwise_url: 'https://readwise.io/bookreview/1',
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      await source.load();

      const raw = JSON.parse(
        (worker.post.mock.calls[0][0] as { databaseRaw: string }).databaseRaw,
      );
      expect(raw[0].readwiseUrl).toBe('https://readwise.io/bookreview/1');
    });

    it('handles book with no highlights', async () => {
      const book = makeExportBook({ highlights: [], num_highlights: 0 });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries[0].note).toBe('');
    });

    it('uses document_note as fallback for summary', async () => {
      const book = makeExportBook({
        summary: null,
        document_note: 'My personal note about this book',
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries[0].abstract).toBe(
        'My personal note about this book',
      );
    });

    it('returns empty array when both APIs return empty', async () => {
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([]),
        fetchReaderDocuments: jest.fn().mockResolvedValue([]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries).toEqual([]);
    });

    it('returns parseErrors from worker response', async () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      worker.post.mockResolvedValue({
        entries: [],
        parseErrors: [{ message: 'test parse error' }],
      });

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.parseErrors).toEqual([{ message: 'test parse error' }]);
    });
  });

  // -------------------------------------------------------------------------
  // load() — reader document specifics
  // -------------------------------------------------------------------------

  describe('load (reader document specifics)', () => {
    it('posts serialized reader entry data to the worker', async () => {
      const docs = [makeReaderDoc({ id: 'doc-1' })];
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue(docs),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      await source.load();

      expect(worker.post).toHaveBeenCalledTimes(1);
      const call = worker.post.mock.calls[0][0];
      expect(call.databaseType).toBe(DATABASE_FORMATS.Readwise);
      const parsed = JSON.parse(call.databaseRaw);
      // Should contain exactly 1 reader entry (books empty)
      expect(parsed).toHaveLength(1);
      expect(parsed[0].rawId).toBe('doc-1');
    });

    it('merges child documents into their parent instead of dropping them', async () => {
      const docs = [
        makeReaderDoc({ id: 'parent-1', parent_id: null, notes: '' }),
        makeReaderDoc({
          id: 'child-1',
          parent_id: 'parent-1',
          content: 'Child highlight text',
          notes: '',
        }),
        makeReaderDoc({ id: 'parent-2', parent_id: null, notes: '' }),
      ];
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue(docs),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rd-src-1', client, worker as never);
      const result = await source.load();

      // Children are folded into parents — only the two parents remain.
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map((e) => e.id)).toEqual([
        'rd-parent-1',
        'rd-parent-2',
      ]);

      const parent1 = result.entries.find(
        (e) => e.id === 'rd-parent-1',
      ) as ReadwiseAdapter;
      expect(parent1.highlights).toHaveLength(1);
      expect(parent1.highlights[0].text).toBe('Child highlight text');

      const parent2 = result.entries.find(
        (e) => e.id === 'rd-parent-2',
      ) as ReadwiseAdapter;
      expect(parent2.highlights).toHaveLength(0);
    });

    it('keeps orphan child documents (missing parent) as top-level entries', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const docs = [
        makeReaderDoc({ id: 'parent-x', parent_id: null }),
        makeReaderDoc({ id: 'orphan-1', parent_id: 'missing-parent' }),
      ];
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue(docs),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rd-src-1', client, worker as never);
      const result = await source.load();

      const ids = result.entries.map((e) => e.id);
      expect(ids).toContain('rd-parent-x');
      expect(ids).toContain('rd-orphan-1');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('extracts tags from object keys', async () => {
      const doc = makeReaderDoc({ tags: { science: {}, ai: {}, ml: {} } });
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue([doc]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rd-src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries[0].keywords).toEqual(['science', 'ai', 'ml']);
    });

    it('maps document fields correctly', async () => {
      const doc = makeReaderDoc({
        id: 'doc-42',
        title: 'AI Research Paper',
        author: 'Alice Smith',
        category: 'article',
        source_url: 'https://arxiv.org/paper',
        url: 'https://readwise.io/reader/doc-42',
        summary: 'Novel AI approach',
        published_date: '2024-03-15',
        image_url: 'https://img.com/paper.jpg',
        notes: 'Key insight about AI.',
      });
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue([doc]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();
      const entry = result.entries[0];

      expect(entry.id).toBe('rd-doc-42');
      expect(entry.title).toBe('AI Research Paper');
      expect(entry.type).toBe('article');
      expect(entry.URL).toBe('https://arxiv.org/paper');
      expect(entry.abstract).toBe('Novel AI approach');
      expect(entry.note).toBe('Key insight about AI.');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('collects API errors in parseErrors instead of throwing', async () => {
      const client = createMockClient({
        fetchExportBooks: jest
          .fn()
          .mockRejectedValue(new Error('API rate limited')),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries).toHaveLength(0);
      expect(result.parseErrors).toBeDefined();
      expect(
        result.parseErrors!.some((e) => e.message.includes('API rate limited')),
      ).toBe(true);
    });

    it('collects non-Error thrown values in parseErrors', async () => {
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockRejectedValue('string error'),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries).toHaveLength(0);
      expect(result.parseErrors).toBeDefined();
      expect(
        result.parseErrors!.some((e) => e.message.includes('string error')),
      ).toBe(true);
    });

    it('throws on a total outage (both APIs fail) with no cache, surfacing both errors', async () => {
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockRejectedValue(new Error('v2 down')),
        fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('v3 down')),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const errSpy = jest.spyOn(console, 'error').mockImplementation();
      // No file system → no cache fallback, so a total outage throws.
      const source = new ReadwiseSource('src-1', client, worker as never);
      const error = await source.load().catch((e: Error) => e);
      errSpy.mockRestore();

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('v2 down');
      expect((error as Error).message).toContain('v3 down');
    });
  });

  // -------------------------------------------------------------------------
  // Highlight aggregation robustness
  // -------------------------------------------------------------------------

  describe('highlight aggregation', () => {
    it('skips highlights with missing or blank text when aggregating', async () => {
      const base = makeExportBook().highlights[0];
      const book = makeExportBook({
        highlights: [
          { ...base, id: 1, text: 'first' },
          { ...base, id: 2, text: '   ' },
          { ...base, id: 3, text: undefined as unknown as string },
          { ...base, id: 4, text: 'second' },
        ],
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      expect(result.entries[0].note).toBe('first\n\n---\n\nsecond');
    });
  });

  // -------------------------------------------------------------------------
  // Extended field mapping (Quick Wins)
  // -------------------------------------------------------------------------

  describe('extended field mapping', () => {
    it('maps v2 book fields (readable_title, source, asin) to the entry', async () => {
      const book = makeExportBook({
        readable_title: 'Clean Code',
        source: 'kindle',
        asin: 'B00AAA',
        document_note: 'Doc-level note',
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const entry = (await source.load()).entries[0] as ReadwiseAdapter;

      expect(entry.titleShort).toBe('Clean Code');
      expect(entry.source).toBe('kindle');
      expect(entry.asin).toBe('B00AAA');
      expect(entry.ISBN).toBeUndefined();
      expect(entry.documentNote).toBe('Doc-level note');
    });

    it('maps v3 reader fields (site_name, word_count, reading_progress, location)', async () => {
      const doc = makeReaderDoc({
        site_name: 'The New Yorker',
        word_count: 3200,
        reading_progress: 0.75,
        location: 'later',
        source: 'web',
      });
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue([doc]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rd-src', client, worker as never);
      const entry = (await source.load()).entries[0] as ReadwiseAdapter;

      expect(entry.containerTitle).toBe('The New Yorker');
      expect(entry.wordCount).toBe(3200);
      expect(entry.readingProgress).toBe(0.75);
      expect(entry.readerLocation).toBe('later');
      expect(entry.source).toBe('web');
    });
  });

  // -------------------------------------------------------------------------
  // Structured highlights
  // -------------------------------------------------------------------------

  describe('structured highlights', () => {
    it('builds a structured highlights array from v2 book highlights', async () => {
      const base = makeExportBook().highlights[0];
      const book = makeExportBook({
        highlights: [
          {
            ...base,
            id: 7,
            text: 'HL text',
            note: 'HL note',
            location: 55,
            location_type: 'page',
            color: 'blue',
            url: 'https://readwise.io/h/7',
            tags: [{ name: 'k1' }, { name: 'k2' }],
          },
        ],
      });
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue([book]),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const entry = (await source.load()).entries[0] as ReadwiseAdapter;

      expect(entry.highlights).toHaveLength(1);
      const h = entry.highlights[0];
      expect(h.id).toBe('7');
      expect(h.text).toBe('HL text');
      expect(h.note).toBe('HL note');
      expect(h.location).toBe(55);
      expect(h.locationType).toBe('page');
      expect(h.color).toBe('blue');
      expect(h.url).toBe('https://readwise.io/h/7');
      expect(h.tags).toEqual(['k1', 'k2']);
    });
  });

  // -------------------------------------------------------------------------
  // watch() and dispose()
  // -------------------------------------------------------------------------

  describe('watch and dispose', () => {
    it('watch is a no-op and does not throw', () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource('src-1', client, worker as never);
      expect(() => source.watch(jest.fn())).not.toThrow();
    });

    it('dispose is a no-op and does not throw', () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource('src-1', client, worker as never);
      expect(() => source.dispose()).not.toThrow();
    });

    it('watch() is idempotent — a second call does not start a second timer', () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      const source = new ReadwiseSource(
        'src-1',
        client,
        worker as never,
        undefined,
        undefined,
        () => 60_000,
      );

      source.watch(jest.fn());
      source.watch(jest.fn());

      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

      source.dispose();
      setTimeoutSpy.mockRestore();
    });

    it('does not arm the polling timer when the interval provider returns 0', () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      const source = new ReadwiseSource(
        'src-1',
        client,
        worker as never,
        undefined,
        undefined,
        () => 0,
      );

      source.watch(jest.fn());

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      source.dispose();
      setTimeoutSpy.mockRestore();
    });

    it('re-reads the interval provider on every cycle (chained timer)', () => {
      jest.useFakeTimers();
      const client = createMockClient();
      const worker = createMockWorkerManager();
      let interval = 1000;
      const source = new ReadwiseSource(
        'src-1',
        client,
        worker as never,
        undefined,
        undefined,
        () => interval,
      );
      const callback = jest.fn();

      source.watch(callback);
      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Disable via the provider: the chain must stop after the next check.
      interval = 0;
      jest.advanceTimersByTime(10_000);
      expect(callback).toHaveBeenCalledTimes(1);

      source.dispose();
      jest.useRealTimers();
    });

    it('dispose() is safe to call twice', () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource(
        'src-1',
        client,
        worker as never,
        undefined,
        undefined,
        () => 60_000,
      );
      source.watch(jest.fn());

      expect(() => {
        source.dispose();
        source.dispose();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Cancellation (AbortSignal threading)
  // -------------------------------------------------------------------------

  describe('cancellation', () => {
    it('passes an AbortSignal to both API calls', async () => {
      const client = createMockClient();
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource('src-1', client, worker as never);

      await source.load();

      expect(client.fetchExportBooks).toHaveBeenCalledWith(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(client.fetchReaderDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('dispose() aborts the in-flight fetch signal', async () => {
      let capturedSignal: AbortSignal | undefined;
      const client = createMockClient({
        fetchExportBooks: jest
          .fn()
          .mockImplementation((opts?: { signal?: AbortSignal }) => {
            capturedSignal = opts?.signal;
            // Never resolves — simulates a slow, paginating fetch.
            return new Promise<ReadwiseExportBook[]>(() => {});
          }),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource('src-1', client, worker as never);

      void source.load();
      // Flush the microtask chain (load() awaits readCachedState before
      // fetching, which adds a few hops even when no cache is configured).
      for (let i = 0; i < 10 && capturedSignal === undefined; i++) {
        await Promise.resolve();
      }

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(false);

      source.dispose();

      expect(capturedSignal!.aborted).toBe(true);
    });

    it('honours an already-aborted external signal', async () => {
      let capturedSignal: AbortSignal | undefined;
      const client = createMockClient({
        fetchExportBooks: jest
          .fn()
          .mockImplementation((opts?: { signal?: AbortSignal }) => {
            capturedSignal = opts?.signal;
            return Promise.resolve([]);
          }),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();
      const source = new ReadwiseSource('src-1', client, worker as never);

      const external = new AbortController();
      external.abort();
      await source.load(external.signal);

      // The internal signal is aborted immediately, not only via a later event.
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Integration: NormalizationPipeline compatibility
  // -------------------------------------------------------------------------

  describe('NormalizationPipeline compatibility', () => {
    it('entries have id and can be tagged with _sourceDatabase', async () => {
      const books = [makeExportBook({ user_book_id: 1 })];
      const client = createMockClient({
        fetchExportBooks: jest.fn().mockResolvedValue(books),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('src-1', client, worker as never);
      const result = await source.load();

      const entry = result.entries[0];
      expect(entry.id).toBeTruthy();

      // Simulate SourceTaggingStep
      entry._sourceDatabase = 'Readwise';
      expect(entry._sourceDatabase).toBe('Readwise');

      // Simulate DeduplicationStep
      entry.id = 'rw-1@db-readwise';
      expect(entry.id).toBe('rw-1@db-readwise');
    });
  });
});

// ---------------------------------------------------------------------------
// applyReadwiseFilters (pure helper)
// ---------------------------------------------------------------------------

describe('applyReadwiseFilters', () => {
  it('returns all entries when no filters are given', () => {
    const entries = [
      makeReadwiseEntryData({ rawId: '1' }),
      makeReadwiseEntryData({ rawId: '2' }),
    ];
    expect(applyReadwiseFilters(entries, undefined)).toHaveLength(2);
    expect(applyReadwiseFilters(entries, {})).toHaveLength(2);
  });

  it('filters by category', () => {
    const entries = [
      makeReadwiseEntryData({ rawId: 'b', category: 'books' }),
      makeReadwiseEntryData({ rawId: 'a', category: 'articles' }),
    ];
    const result = applyReadwiseFilters(entries, { categories: ['articles'] });
    expect(result.map((e) => e.rawId)).toEqual(['a']);
  });

  it('filters by tags (keeps entries matching any tag)', () => {
    const entries = [
      makeReadwiseEntryData({ rawId: 'x', tags: ['science', 'ai'] }),
      makeReadwiseEntryData({ rawId: 'y', tags: ['cooking'] }),
    ];
    const result = applyReadwiseFilters(entries, { tags: ['ai'] });
    expect(result.map((e) => e.rawId)).toEqual(['x']);
  });

  it('applies minHighlights only to highlight-mode entries', () => {
    const entries = [
      makeReadwiseEntryData({
        rawId: 'few',
        mode: 'readwise-highlights',
        highlightCount: 1,
      }),
      makeReadwiseEntryData({
        rawId: 'many',
        mode: 'readwise-highlights',
        highlightCount: 10,
      }),
      makeReadwiseEntryData({
        rawId: 'doc',
        mode: 'reader-documents',
        highlightCount: 0,
      }),
    ];
    const result = applyReadwiseFilters(entries, { minHighlights: 5 });
    // 'few' dropped; reader doc passes through despite 0 highlights.
    expect(result.map((e) => e.rawId).sort()).toEqual(['doc', 'many']);
  });

  it('applies readerLocations only to reader documents', () => {
    const entries = [
      makeReadwiseEntryData({
        rawId: 'later',
        mode: 'reader-documents',
        readerLocation: 'later',
      }),
      makeReadwiseEntryData({
        rawId: 'archived',
        mode: 'reader-documents',
        readerLocation: 'archive',
      }),
      makeReadwiseEntryData({
        rawId: 'book',
        mode: 'readwise-highlights',
        readerLocation: null,
      }),
    ];
    const result = applyReadwiseFilters(entries, {
      readerLocations: ['later'],
    });
    // 'archived' dropped; highlight-mode entry passes through.
    expect(result.map((e) => e.rawId).sort()).toEqual(['book', 'later']);
  });

  it('combines multiple filter dimensions (AND)', () => {
    const entries = [
      makeReadwiseEntryData({
        rawId: 'keep',
        category: 'books',
        tags: ['ml'],
      }),
      makeReadwiseEntryData({
        rawId: 'wrong-cat',
        category: 'articles',
        tags: ['ml'],
      }),
      makeReadwiseEntryData({
        rawId: 'wrong-tag',
        category: 'books',
        tags: ['other'],
      }),
    ];
    const result = applyReadwiseFilters(entries, {
      categories: ['books'],
      tags: ['ml'],
    });
    expect(result.map((e) => e.rawId)).toEqual(['keep']);
  });

  it('matches categories case-insensitively', () => {
    const entries = [makeReadwiseEntryData({ rawId: 'b', category: 'books' })];
    // Readwise returns lowercase; a "Books" filter must still match.
    expect(
      applyReadwiseFilters(entries, { categories: ['Books'] }).map(
        (e) => e.rawId,
      ),
    ).toEqual(['b']);
  });

  it('does not crash on a null category when a category filter is set', () => {
    const entries = [
      makeReadwiseEntryData({
        rawId: 'nullcat',
        category: null as unknown as string,
      }),
      makeReadwiseEntryData({ rawId: 'b', category: 'books' }),
    ];
    const result = applyReadwiseFilters(entries, { categories: ['books'] });
    // The null-category entry is excluded rather than throwing.
    expect(result.map((e) => e.rawId)).toEqual(['b']);
  });

  it('does not crash on missing tags when a tag filter is set', () => {
    const entries = [
      makeReadwiseEntryData({
        rawId: 'notags',
        tags: undefined as unknown as string[],
      }),
      makeReadwiseEntryData({ rawId: 'tagged', tags: ['ml'] }),
    ];
    const result = applyReadwiseFilters(entries, { tags: ['ml'] });
    // The tag-less entry is excluded rather than throwing on a null deref.
    expect(result.map((e) => e.rawId)).toEqual(['tagged']);
  });
});

// ---------------------------------------------------------------------------
// ReadwiseSource with import filters
// ---------------------------------------------------------------------------

describe('ReadwiseSource with filters', () => {
  it('drops entries that do not match the configured filter', async () => {
    const book = makeExportBook({ category: 'books' });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([book]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      'src-1',
      client,
      worker as never,
      undefined,
      undefined,
      undefined,
      { categories: ['articles'] },
    );
    const result = await source.load();

    expect(result.entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Offline cache
// ---------------------------------------------------------------------------

describe('ReadwiseSource offline cache', () => {
  it('writes fetched data to the cache file after a successful load', async () => {
    const fs = createMockFileSystem();
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    await source.load();

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/cache.json',
      expect.any(String),
    );
  });

  it('does not fail the load when the cache write throws', async () => {
    const fs = createMockFileSystem({
      writeFile: jest.fn().mockRejectedValue(new Error('disk full')),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    const result = await source.load();

    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('falls back to cached data when both APIs fail, without clobbering the cache', async () => {
    const cachedRaw = JSON.stringify([
      makeReadwiseEntryData({ rawId: 'cached' }),
    ]);
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockResolvedValue(cachedRaw),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockRejectedValue(new Error('down')),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    const result = await source.load();
    warnSpy.mockRestore();

    expect(
      result.parseErrors!.some((e) => e.message.includes('using cache')),
    ).toBe(true);
    expect(result.entries).toHaveLength(1);
    // The good cache must NOT be overwritten with the empty fetch result.
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('throws on a total outage with no cache (so the prior library is preserved)', async () => {
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(false),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockRejectedValue(new Error('down')),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    await expect(source.load()).rejects.toThrow(
      'Failed to load from Readwise API',
    );
    // The cache must NOT be overwritten with an empty result.
    expect(fs.writeFile).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('treats a cache read error as no cache (throws on total outage)', async () => {
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockRejectedValue(new Error('read error')),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockRejectedValue(new Error('down')),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    // readCache swallows the read error and returns null → no cache → throw.
    await expect(source.load()).rejects.toThrow(
      'Failed to load from Readwise API',
    );
    errSpy.mockRestore();
  });

  it('treats a corrupt cache as no cache (throws on total outage)', async () => {
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockResolvedValue('not-json{{{'),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockRejectedValue(new Error('down')),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    // An unparseable cache must NOT degrade into an empty "success with
    // warnings" (which would wipe the in-memory library) — it must fail.
    await expect(source.load()).rejects.toThrow(
      'Failed to load from Readwise API',
    );
    errSpy.mockRestore();
  });

  it('still uses a legitimately cached empty array on a total outage', async () => {
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockResolvedValue('[]'),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockRejectedValue(new Error('down')),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    const result = await source.load();
    warnSpy.mockRestore();

    // An empty array is valid cache content, not corruption.
    expect(result.entries).toHaveLength(0);
    expect(
      result.parseErrors!.some((e) => e.message.includes('using cache')),
    ).toBe(true);
  });

  it('does not overwrite the cache on a partial fetch failure', async () => {
    const fs = createMockFileSystem();
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('v3 down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    const result = await source.load();

    // Books are still returned for this session...
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.parseErrors!.some((e) => e.message.includes('v3 down'))).toBe(
      true,
    );
    // ...but the previously-complete cache is preserved (not clobbered).
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('applies CURRENT filters to cached data on a total-outage fallback', async () => {
    // Cache holds two entries of different categories (stored UNFILTERED).
    const cachedRaw = JSON.stringify([
      makeReadwiseEntryData({ rawId: 'book', category: 'books' }),
      makeReadwiseEntryData({ rawId: 'art', category: 'articles' }),
    ]);
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockResolvedValue(cachedRaw),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockRejectedValue(new Error('down')),
      fetchReaderDocuments: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    // Current filter = articles only; it must apply to the cached (unfiltered) set.
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
      undefined,
      { categories: ['articles'] },
    );
    const result = await source.load();
    warnSpy.mockRestore();

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('rw-art');
  });

  it('throws when worker processing fails and no cache is available', async () => {
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = {
      post: jest.fn().mockRejectedValue(new Error('worker boom')),
    };

    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    // No file system → no cache fallback available.
    const source = new ReadwiseSource('s', client, worker as never);
    await expect(source.load()).rejects.toThrow(
      'Failed to load from Readwise API',
    );
    errSpy.mockRestore();
  });

  it('falls back to cache when worker processing fails but a cache exists', async () => {
    const cachedRaw = JSON.stringify([
      makeReadwiseEntryData({ rawId: 'cached' }),
    ]);
    const fs = createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockResolvedValue(cachedRaw),
    });
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
    } as unknown as Partial<ReadwiseApiClient>);
    // First post (fresh data) fails; the cache reprocess succeeds.
    const worker = {
      post: jest
        .fn()
        .mockRejectedValueOnce(new Error('worker boom'))
        .mockImplementation((msg: { databaseRaw: string }) =>
          Promise.resolve({
            entries: JSON.parse(msg.databaseRaw),
            parseErrors: [],
          }),
        ),
    };

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/cache.json',
    );
    const result = await source.load();
    warnSpy.mockRestore();

    expect(result.entries).toHaveLength(1);
    expect(
      result.parseErrors!.some((e) => e.message.includes('using cache')),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Periodic sync timer
// ---------------------------------------------------------------------------

describe('ReadwiseSource periodic sync', () => {
  it('invokes the callback when the polling interval fires', () => {
    jest.useFakeTimers();
    const client = createMockClient();
    const worker = createMockWorkerManager();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      undefined,
      undefined,
      () => 1000,
    );
    const callback = jest.fn();

    source.watch(callback);
    jest.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalledTimes(1);

    source.dispose();
    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Incremental sync (updatedAfter + delta merge)
// ---------------------------------------------------------------------------

describe('ReadwiseSource incremental sync', () => {
  const CURSOR = '2024-06-01T00:00:00.000Z';
  /**
   * The cursor actually sent as `updatedAfter`: the stored cursor minus the
   * 5-minute clock-skew overlap (re-delivered entries are re-merged
   * idempotently, so over-fetching is free).
   */
  const OVERLAPPED_CURSOR = '2024-05-31T23:55:00.000Z';

  function makeV1Cache(
    entries: ReadwiseEntryData[],
    lastSyncAt: string | null = CURSOR,
  ): string {
    return JSON.stringify({ version: 1, lastSyncAt, entries });
  }

  function makeCachedFs(cacheRaw: string): IFileSystem {
    return createMockFileSystem({
      exists: jest.fn().mockResolvedValue(true),
      readFile: jest.fn().mockResolvedValue(cacheRaw),
      writeFile: jest.fn().mockResolvedValue(undefined),
    });
  }

  it('passes the overlapped cursor as updatedAfter to both endpoints', async () => {
    const fs = makeCachedFs(makeV1Cache([makeReadwiseEntryData()]));
    const client = createMockClient();
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    await source.load();

    expect(client.fetchExportBooks).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAfter: OVERLAPPED_CURSOR }),
    );
    expect(client.fetchReaderDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAfter: OVERLAPPED_CURSOR }),
    );
  });

  it('falls back to a full fetch when the cached cursor is unparseable', async () => {
    const fs = makeCachedFs(
      makeV1Cache([makeReadwiseEntryData()], 'not-a-date'),
    );
    const client = createMockClient();
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    await source.load();

    expect(client.fetchExportBooks).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAfter: undefined }),
    );
  });

  it('does a full fetch when the cache is in the legacy array format', async () => {
    const fs = makeCachedFs(JSON.stringify([makeReadwiseEntryData()]));
    const client = createMockClient();
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    await source.load();

    expect(client.fetchExportBooks).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAfter: undefined }),
    );
  });

  it('bypasses incremental sync when fullRefresh is requested', async () => {
    const fs = makeCachedFs(makeV1Cache([makeReadwiseEntryData()]));
    const client = createMockClient();
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    await source.load(undefined, { fullRefresh: true });

    expect(client.fetchExportBooks).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAfter: undefined }),
    );
  });

  it('merges the delta into the cached base instead of replacing it', async () => {
    // Cache holds book 1 (one old highlight) and book 2 (untouched).
    const cachedBook1 = makeReadwiseEntryData({
      rawId: '1',
      title: 'Book One',
      highlights: [
        {
          id: 'old-h',
          text: 'old highlight',
          note: null,
          location: null,
          locationType: null,
          color: null,
          highlightedAt: null,
          url: null,
          tags: [],
        },
      ],
      highlightCount: 1,
      highlightsText: 'old highlight',
    });
    const cachedBook2 = makeReadwiseEntryData({
      rawId: '2',
      title: 'Book Two',
    });
    const fs = makeCachedFs(makeV1Cache([cachedBook1, cachedBook2]));

    // Delta returns ONLY book 1 with ONLY its new highlight.
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([
        makeExportBook({
          user_book_id: 1,
          title: 'Book One (renamed)',
          highlights: [
            {
              id: 99,
              text: 'new highlight',
              note: '',
              location: 1,
              location_type: 'page',
              highlighted_at: '2024-06-02T00:00:00Z',
              url: null,
              color: '',
              updated: '2024-06-02T00:00:00Z',
              book_id: 1,
              tags: [],
            },
          ],
          num_highlights: 1,
        }),
      ]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    const result = await source.load();

    // Both books survive the merge.
    expect(result.entries).toHaveLength(2);
    const book1 = result.entries.find(
      (e) => (e as ReadwiseAdapter).citekey === 'rw-1',
    ) as ReadwiseAdapter;
    expect(book1.title).toBe('Book One (renamed)');
    // Old highlight kept, new one added.
    const texts = book1.highlights.map((h) => h.text);
    expect(texts).toContain('old highlight');
    expect(texts).toContain('new highlight');
  });

  it('writes the merged set in the v1 cache format with an advanced cursor', async () => {
    const fs = makeCachedFs(
      makeV1Cache([makeReadwiseEntryData({ rawId: '2' })]),
    );
    const client = createMockClient({
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const before = new Date().toISOString();
    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    await source.load();

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      (fs.writeFile as jest.Mock).mock.calls[0][1] as string,
    ) as { version: number; lastSyncAt: string; entries: unknown[] };
    expect(written.version).toBe(1);
    // Cursor advanced past the old one and not in the future.
    expect(written.lastSyncAt >= before).toBe(true);
    // Merged set: cached book 2 + fetched book 1.
    expect(written.entries).toHaveLength(2);
  });

  it('folds a delta orphan reader child into its cached parent', async () => {
    const cachedParent = makeReadwiseEntryData({
      mode: 'reader-documents',
      rawId: 'parent-1',
      title: 'Parent Doc',
      highlights: [],
      highlightCount: 0,
    });
    const fs = makeCachedFs(makeV1Cache([cachedParent]));

    const client = createMockClient({
      fetchReaderDocuments: jest.fn().mockResolvedValue([
        makeReaderDoc({
          id: 'child-1',
          parent_id: 'parent-1',
          content: 'fresh child highlight',
          category: 'highlight',
        }),
      ]),
    } as unknown as Partial<ReadwiseApiClient>);
    const worker = createMockWorkerManager();

    const source = new ReadwiseSource(
      's',
      client,
      worker as never,
      fs,
      '/c.json',
    );
    const result = await source.load();

    expect(result.entries).toHaveLength(1);
    const parent = result.entries[0] as ReadwiseAdapter;
    expect(parent.citekey).toBe('rd-parent-1');
    expect(parent.highlights.map((h) => h.text)).toContain(
      'fresh child highlight',
    );
  });
});
