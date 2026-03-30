jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import { ReadwiseSource } from '../../src/sources/readwise-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from '../../src/core/readwise/readwise-api-client';
import { ReadwiseAdapter } from '../../src/core/adapters/readwise-adapter';
import { DATABASE_FORMATS } from '../../src/core/types/database';

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

    it('passes updatedAfter to both API clients', async () => {
      const fetchBooksMock = jest.fn().mockResolvedValue([]);
      const fetchDocsMock = jest.fn().mockResolvedValue([]);
      const client = createMockClient({
        fetchExportBooks: fetchBooksMock,
        fetchReaderDocuments: fetchDocsMock,
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rw-src-1', client, worker as never, {
        updatedAfter: '2024-01-01',
      });
      await source.load();

      expect(fetchBooksMock).toHaveBeenCalledWith({
        updatedAfter: '2024-01-01',
      });
      expect(fetchDocsMock).toHaveBeenCalledWith({
        updatedAfter: '2024-01-01',
      });
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

    it('filters out child documents with parent_id', async () => {
      const docs = [
        makeReaderDoc({ id: 'parent-1', parent_id: null }),
        makeReaderDoc({ id: 'child-1', parent_id: 'parent-1' }),
        makeReaderDoc({ id: 'parent-2', parent_id: null }),
      ];
      const client = createMockClient({
        fetchReaderDocuments: jest.fn().mockResolvedValue(docs),
      } as unknown as Partial<ReadwiseApiClient>);
      const worker = createMockWorkerManager();

      const source = new ReadwiseSource('rd-src-1', client, worker as never);
      const result = await source.load();

      // Only top-level reader docs (books array is empty)
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map((e) => e.id)).toEqual([
        'rd-parent-1',
        'rd-parent-2',
      ]);
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
