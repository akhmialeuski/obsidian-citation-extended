/**
 * @jest-environment jsdom
 *
 * jsdom provides `window`, matching Obsidian's Electron renderer where the
 * client runs. The rate-limit `sleep()` uses `window.setTimeout`.
 */
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
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 400));

      await expect(client.validateToken()).rejects.toThrow(ReadwiseApiError);
      // 4xx client errors are not retried.
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
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

    it('parses an HTTP-date Retry-After header (RFC 7231 date form)', async () => {
      // Modern fake timers also fake Date.now, so the delta is deterministic.
      const retryAt = new Date(Date.now() + 2000).toUTCString();
      mockHttpGet
        .mockResolvedValueOnce(
          mockHttpResponse(null, 429, { 'Retry-After': retryAt }),
        )
        .mockResolvedValueOnce(mockHttpResponse(null, 204));

      const promise = client.validateToken();
      // Well before the 60s default — the date form must be honoured.
      await jest.advanceTimersByTimeAsync(3000);

      await expect(promise).resolves.toBe(true);
      expect(mockHttpGet).toHaveBeenCalledTimes(2);
    });

    it('falls back to the 60s default for an unparseable Retry-After', async () => {
      mockHttpGet
        .mockResolvedValueOnce(
          mockHttpResponse(null, 429, { 'Retry-After': 'soonish' }),
        )
        .mockResolvedValueOnce(mockHttpResponse(null, 204));

      const promise = client.validateToken();
      await jest.advanceTimersByTimeAsync(61000);

      await expect(promise).resolves.toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Transient failures (5xx / network)
  // -------------------------------------------------------------------------

  describe('transient failures', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries a 5xx response and succeeds', async () => {
      mockHttpGet
        .mockResolvedValueOnce(mockHttpResponse(null, 502))
        .mockResolvedValueOnce(mockHttpResponse(null, 204));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const promise = client.validateToken();
      // First backoff step is 1s.
      await jest.advanceTimersByTimeAsync(1500);

      await expect(promise).resolves.toBe(true);
      expect(mockHttpGet).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it('retries a network-level failure and succeeds', async () => {
      mockHttpGet
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce(mockHttpResponse(null, 204));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const promise = client.validateToken();
      await jest.advanceTimersByTimeAsync(1500);

      await expect(promise).resolves.toBe(true);
      expect(mockHttpGet).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it('throws ReadwiseApiError after MAX_RETRIES persistent 5xx responses', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 503));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const promise = client.fetchExportBooks();
      // Swallow the eventual rejection so it is not "unhandled" while the
      // fake clock advances past the 1s + 2s + 4s backoff steps.
      const settled = promise.catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(8000);

      const error = await settled;
      expect(error).toBeInstanceOf(ReadwiseApiError);
      expect((error as ReadwiseApiError).statusCode).toBe(503);
      // Initial call + 3 retries.
      expect(mockHttpGet).toHaveBeenCalledTimes(4);
      warnSpy.mockRestore();
    });

    it('throws ReadwiseApiError after MAX_RETRIES persistent network failures', async () => {
      mockHttpGet.mockRejectedValue(new Error('Network error'));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const promise = client.validateToken();
      const settled = promise.catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(8000);

      const error = await settled;
      expect(error).toBeInstanceOf(ReadwiseApiError);
      expect((error as ReadwiseApiError).message).toContain('Network error');
      expect(mockHttpGet).toHaveBeenCalledTimes(4);
      warnSpy.mockRestore();
    });

    it('does not retry non-429 4xx client errors', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 404));

      await expect(client.fetchExportBooks()).rejects.toThrow(ReadwiseApiError);
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
    });

    it('rejects with the abort reason when aborted during a backoff wait', async () => {
      const controller = new AbortController();
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 500));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const promise = client.fetchExportBooks({ signal: controller.signal });
      const settled = promise.catch((e: unknown) => e);
      controller.abort(new Error('aborted during backoff'));
      await jest.advanceTimersByTimeAsync(100);

      const error = await settled;
      expect((error as Error).message).toBe('aborted during backoff');
      warnSpy.mockRestore();
    });

    it('does not retry a transport rejection caused by an abort', async () => {
      const controller = new AbortController();
      mockHttpGet.mockImplementation(() => {
        controller.abort(new Error('aborted mid-request'));
        return Promise.reject(new Error('request destroyed'));
      });

      await expect(client.validateToken(controller.signal)).rejects.toThrow(
        'aborted mid-request',
      );
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws ReadwiseApiError with status code for non-retryable responses', async () => {
      mockHttpGet.mockResolvedValue(mockHttpResponse(null, 403));

      try {
        await client.fetchExportBooks();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ReadwiseApiError);
        expect((error as ReadwiseApiError).statusCode).toBe(403);
        expect((error as ReadwiseApiError).message).toContain('403');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Malformed responses
  // -------------------------------------------------------------------------

  describe('malformed responses', () => {
    it('throws ReadwiseApiError when the body is not valid JSON', async () => {
      mockHttpGet.mockResolvedValue({
        status: 200,
        headers: {},
        json: jest.fn().mockRejectedValue(new SyntaxError('bad json')),
      });

      await expect(client.fetchExportBooks()).rejects.toThrow(ReadwiseApiError);
      await expect(client.fetchExportBooks()).rejects.toThrow('invalid JSON');
    });

    it('throws ReadwiseApiError when results is not an array', async () => {
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({
          count: 0,
          nextPageCursor: null,
          results: 'not-an-array',
        }),
      );

      await expect(client.fetchReaderDocuments()).rejects.toThrow(
        /Unexpected Readwise API response shape/,
      );
    });

    it('follows a numeric nextPageCursor instead of truncating pagination', async () => {
      const book1 = makeExportBook({ user_book_id: 1 });
      const book2 = makeExportBook({ user_book_id: 2 });
      // v2 Export responses have been observed with numeric cursors; dropping
      // them would silently load only the first page of the library.
      mockHttpGet
        .mockResolvedValueOnce(
          mockHttpResponse({ count: 2, nextPageCursor: 42, results: [book1] }),
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
      expect(mockHttpGet.mock.calls[1][0]).toContain('pageCursor=42');
    });

    it('treats a garbage nextPageCursor as the end of pagination', async () => {
      const book = makeExportBook();
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({
          count: 1,
          nextPageCursor: { bogus: true },
          results: [book],
        }),
      );

      const result = await client.fetchExportBooks();
      expect(result).toEqual([book]);
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Pagination safety
  // -------------------------------------------------------------------------

  describe('pagination safety', () => {
    it('stops paginating when the server repeats a cursor', async () => {
      const book = makeExportBook();
      // Every page points back to the same cursor — a server-side loop.
      mockHttpGet.mockResolvedValue(
        mockHttpResponse({ count: 1, nextPageCursor: 'loop', results: [book] }),
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await client.fetchExportBooks();
      warnSpy.mockRestore();

      // Request 1 (cursor=null) → 'loop'; request 2 (cursor='loop') → 'loop'
      // again, already requested → stop. Two fetches, two accumulated books.
      expect(mockHttpGet).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('aborts while waiting to retry after a 429', async () => {
      const controller = new AbortController();
      mockHttpGet.mockResolvedValue(
        mockHttpResponse(null, 429, { 'Retry-After': '300' }),
      );

      const promise = client.fetchExportBooks({ signal: controller.signal });
      // Abort before the (300s) retry wait completes.
      controller.abort(new Error('aborted during wait'));

      await expect(promise).rejects.toThrow('aborted during wait');
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
