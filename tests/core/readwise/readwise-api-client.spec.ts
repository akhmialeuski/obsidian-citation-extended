jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import {
  ReadwiseApiClient,
  ReadwiseApiError,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
  HttpGetFn,
  HttpResponse,
} from '../../../src/core/readwise/readwise-api-client';

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

function mockHttpResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    headers,
    json: jest.fn().mockResolvedValue(body),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReadwiseApiClient', () => {
  let client: ReadwiseApiClient;
  let mockHttpGet: jest.MockedFunction<HttpGetFn>;

  beforeEach(() => {
    mockHttpGet = jest.fn();
    client = new ReadwiseApiClient('test-token-abc', mockHttpGet);
  });

  // -------------------------------------------------------------------------
  // ReadwiseApiError
  // -------------------------------------------------------------------------

  describe('ReadwiseApiError', () => {
    it('is an instance of Error', () => {
      const err = new ReadwiseApiError('fail', 429, 60);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ReadwiseApiError');
      expect(err.message).toBe('fail');
      expect(err.statusCode).toBe(429);
      expect(err.retryAfter).toBe(60);
    });

    it('works without optional fields', () => {
      const err = new ReadwiseApiError('network error');
      expect(err.statusCode).toBeUndefined();
      expect(err.retryAfter).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // validateToken
  // -------------------------------------------------------------------------

  describe('validateToken', () => {
    it('returns true for 204 response', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 204));

      const result = await client.validateToken();
      expect(result).toBe(true);
      expect(mockHttpGet).toHaveBeenCalledWith(
        'https://readwise.io/api/v2/auth/',
        { Authorization: 'Token test-token-abc' },
      );
    });

    it('returns false for 401 response', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 401));

      const result = await client.validateToken();
      expect(result).toBe(false);
    });

    it('throws ReadwiseApiError for other non-OK statuses', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 500));

      await expect(client.validateToken()).rejects.toThrow(ReadwiseApiError);
    });

    it('throws when AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));

      await expect(client.validateToken(controller.signal)).rejects.toThrow(
        'cancelled',
      );
      expect(mockHttpGet).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // fetchExportBooks
  // -------------------------------------------------------------------------

  describe('fetchExportBooks', () => {
    it('returns books from single page', async () => {
      const books = [makeExportBook()];
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 1, nextPageCursor: null, results: books }),
      );

      const result = await client.fetchExportBooks();
      expect(result).toEqual(books);
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
    });

    it('handles pagination across multiple pages', async () => {
      const book1 = makeExportBook({ user_book_id: 1, title: 'Book 1' });
      const book2 = makeExportBook({ user_book_id: 2, title: 'Book 2' });

      mockHttpGet
        .mockResolvedValueOnce(
          mockHttpResponse({
            count: 2,
            nextPageCursor: 'cursor-2',
            results: [book1],
          }),
        )
        .mockResolvedValueOnce(
          mockHttpResponse({
            count: 2,
            nextPageCursor: null,
            results: [book2],
          }),
        );

      const result = await client.fetchExportBooks();
      expect(result).toEqual([book1, book2]);
      expect(mockHttpGet).toHaveBeenCalledTimes(2);

      // Second call should include pageCursor
      const secondCallUrl = mockHttpGet.mock.calls[1][0];
      expect(secondCallUrl).toContain('pageCursor=cursor-2');
    });

    it('passes updatedAfter parameter', async () => {
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 0, nextPageCursor: null, results: [] }),
      );

      await client.fetchExportBooks({ updatedAfter: '2024-01-01T00:00:00Z' });

      const url = mockHttpGet.mock.calls[0][0];
      expect(url).toContain('updatedAfter=2024-01-01T00%3A00%3A00Z');
    });

    it('checks AbortSignal before each request', async () => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));

      await expect(
        client.fetchExportBooks({ signal: controller.signal }),
      ).rejects.toThrow('cancelled');
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it('returns empty array when no books', async () => {
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 0, nextPageCursor: null, results: [] }),
      );

      const result = await client.fetchExportBooks();
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // fetchReaderDocuments
  // -------------------------------------------------------------------------

  describe('fetchReaderDocuments', () => {
    it('returns documents from single page', async () => {
      const docs = [makeReaderDoc()];
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 1, nextPageCursor: null, results: docs }),
      );

      const result = await client.fetchReaderDocuments();
      expect(result).toEqual(docs);
    });

    it('handles pagination across multiple pages', async () => {
      const doc1 = makeReaderDoc({ id: 'doc-1' });
      const doc2 = makeReaderDoc({ id: 'doc-2' });

      mockHttpGet
        .mockResolvedValueOnce(
          mockHttpResponse({
            count: 2,
            nextPageCursor: 'cursor-next',
            results: [doc1],
          }),
        )
        .mockResolvedValueOnce(
          mockHttpResponse({
            count: 2,
            nextPageCursor: null,
            results: [doc2],
          }),
        );

      const result = await client.fetchReaderDocuments();
      expect(result).toEqual([doc1, doc2]);
      expect(mockHttpGet).toHaveBeenCalledTimes(2);
    });

    it('passes updatedAfter parameter', async () => {
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 0, nextPageCursor: null, results: [] }),
      );

      await client.fetchReaderDocuments({
        updatedAfter: '2024-03-01',
      });

      const url = mockHttpGet.mock.calls[0][0];
      expect(url).toContain('updatedAfter=2024-03-01');
    });

    it('uses v3 API base URL', async () => {
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 0, nextPageCursor: null, results: [] }),
      );

      await client.fetchReaderDocuments();

      const url = mockHttpGet.mock.calls[0][0];
      expect(url).toContain('readwise.io/api/v3/list/');
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  describe('rate limiting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries on 429 with Retry-After header', async () => {
      mockHttpGet
        .mockResolvedValueOnce(
          mockHttpResponse(null, 429, { 'Retry-After': '2' }),
        )
        .mockResolvedValueOnce(mockHttpResponse(null, 204));

      const promise = client.validateToken();

      // Advance past the retry delay
      await jest.advanceTimersByTimeAsync(3000);

      const result = await promise;
      expect(result).toBe(true);
      expect(mockHttpGet).toHaveBeenCalledTimes(2);
    });

    it('throws after MAX_RETRIES (3) rate limit responses', async () => {
      // Temporarily switch to real timers so sleep actually resolves.
      // Use Retry-After: 1 (minimum valid value) to keep the test fast.
      jest.useRealTimers();

      mockHttpGet.mockResolvedValue(
        mockHttpResponse(null, 429, { 'Retry-After': '1' }),
      );

      await expect(client.validateToken()).rejects.toThrow(ReadwiseApiError);
      // Initial call + 3 retries = 4 total fetch calls
      expect(mockHttpGet).toHaveBeenCalledTimes(4);

      // Restore fake timers for remaining tests
      jest.useFakeTimers();
    }, 15000);

    it('uses default 60s when Retry-After header is missing', async () => {
      mockHttpGet
        .mockResolvedValueOnce(mockHttpResponse(null, 429))
        .mockResolvedValueOnce(mockHttpResponse(null, 204));

      const promise = client.validateToken();

      // Default is 60 seconds
      await jest.advanceTimersByTimeAsync(61000);

      const result = await promise;
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws ReadwiseApiError with status code for non-OK responses', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 503));

      try {
        await client.fetchExportBooks();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ReadwiseApiError);
        expect((error as ReadwiseApiError).statusCode).toBe(503);
        expect((error as ReadwiseApiError).message).toContain('503');
      }
    });

    it('throws on network failure', async () => {
      mockHttpGet.mockRejectedValue(new Error('Network error'));

      await expect(client.validateToken()).rejects.toThrow('Network error');
    });
  });

  // -------------------------------------------------------------------------
  // Authorization header
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('sends Authorization header with Token prefix', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 204));

      await client.validateToken();

      expect(mockHttpGet).toHaveBeenCalledWith(expect.any(String), {
        Authorization: 'Token test-token-abc',
      });
    });
  });
});
