/**
 * HTTP client for the Readwise API (v2 Export & v3 Reader).
 *
 * Pure TypeScript — no Obsidian dependencies.  Handles authentication,
 * pagination, rate-limit back-off, and cancellation via AbortSignal.
 *
 * Network I/O is delegated to an injected {@link HttpGetFn} so that
 * the host environment can provide its own transport (e.g. Obsidian's
 * `requestUrl`).
 */

// ---------------------------------------------------------------------------
// HTTP abstraction
// ---------------------------------------------------------------------------

/** Minimal HTTP response surface used by the client. */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  json(): Promise<unknown>;
}

/**
 * A function that performs an HTTP GET request and returns an
 * {@link HttpResponse}.  The caller is responsible for providing an
 * implementation — e.g. wrapping the platform's built-in HTTP API.
 */
export type HttpGetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<HttpResponse>;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Error thrown by {@link ReadwiseApiClient} on API failures. */
export class ReadwiseApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ReadwiseApiError';
  }
}

// ---------------------------------------------------------------------------
// Response types — Readwise API v2 (Export)
// ---------------------------------------------------------------------------

export interface ReadwiseHighlight {
  id: number;
  text: string;
  note: string;
  location: number;
  location_type: string;
  highlighted_at: string | null;
  url: string | null;
  color: string;
  updated: string;
  book_id: number;
  tags: Array<{ name: string }>;
}

export interface ReadwiseExportBook {
  user_book_id: number;
  title: string;
  author: string;
  readable_title: string;
  source: string;
  cover_image_url: string;
  unique_url: string | null;
  book_tags: Array<{ name: string }>;
  category: string;
  readwise_url: string;
  source_url: string | null;
  asin: string | null;
  highlights: ReadwiseHighlight[];
  document_note: string | null;
  summary: string | null;
  num_highlights: number;
}

// ---------------------------------------------------------------------------
// Response types — Reader API v3
// ---------------------------------------------------------------------------

export interface ReadwiseReaderDocument {
  id: string;
  url: string;
  source_url: string;
  title: string;
  author: string;
  source: string;
  category: string;
  location: string;
  tags: Record<string, unknown>;
  site_name: string | null;
  word_count: number | null;
  created_at: string;
  updated_at: string;
  published_date: string | null;
  summary: string | null;
  image_url: string | null;
  content: string | null;
  html: string | null;
  parent_id: string | null;
  reading_progress: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Internal pagination response shapes
// ---------------------------------------------------------------------------

interface ExportPageResponse {
  count: number;
  nextPageCursor: string | null;
  results: ReadwiseExportBook[];
}

interface ReaderPageResponse {
  count: number;
  nextPageCursor: string | null;
  results: ReadwiseReaderDocument[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const READWISE_API_V2 = 'https://readwise.io/api/v2';
const READER_API_V3 = 'https://readwise.io/api/v3';
const MAX_RETRIES = 3;
const DEFAULT_RETRY_SECONDS = 60;

/**
 * Pure HTTP client for the Readwise API.
 *
 * Supports two endpoint families:
 * - **v2 Export** — highlights-focused, returns books with nested highlights.
 * - **v3 Reader** — documents-focused, returns documents with metadata.
 *
 * All network calls respect an optional {@link AbortSignal} for cancellation
 * and automatically retry on HTTP 429 (rate-limit) responses.
 */
export class ReadwiseApiClient {
  constructor(
    private readonly token: string,
    private readonly httpGet: HttpGetFn,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Validate the API token against the Readwise auth endpoint.
   *
   * @returns `true` when the token is valid (HTTP 204),
   *          `false` when the server returns 401 Unauthorized.
   * @throws  {@link ReadwiseApiError} on unexpected HTTP status codes or
   *          network failures.
   */
  async validateToken(signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await this.fetchWithRateLimit(
        `${READWISE_API_V2}/auth/`,
        signal,
      );
      return response.status === 204;
    } catch (error) {
      if (error instanceof ReadwiseApiError && error.statusCode === 401) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Fetch all books with highlights from the Readwise v2 Export API.
   *
   * Handles pagination automatically — keeps requesting pages until
   * `nextPageCursor` is `null`.
   *
   * @param options.updatedAfter  ISO 8601 date string; only return books
   *                              updated after this timestamp.
   * @param options.signal        AbortSignal for cancellation.
   * @returns Complete array of exported books.
   */
  async fetchExportBooks(options?: {
    updatedAfter?: string;
    signal?: AbortSignal;
  }): Promise<ReadwiseExportBook[]> {
    const allBooks: ReadwiseExportBook[] = [];
    let cursor: string | null = null;

    do {
      const url = this.buildUrl(`${READWISE_API_V2}/export/`, {
        updatedAfter: options?.updatedAfter,
        pageCursor: cursor ?? undefined,
      });

      const response = await this.fetchWithRateLimit(url, options?.signal);
      const page = (await response.json()) as ExportPageResponse;

      allBooks.push(...page.results);
      cursor = page.nextPageCursor;
    } while (cursor !== null);

    return allBooks;
  }

  /**
   * Fetch all documents from the Reader API v3.
   *
   * Handles pagination automatically — keeps requesting pages until
   * `nextPageCursor` is `null`.
   *
   * @param options.updatedAfter  ISO 8601 date string; only return documents
   *                              updated after this timestamp.
   * @param options.signal        AbortSignal for cancellation.
   * @returns Complete array of reader documents.
   */
  async fetchReaderDocuments(options?: {
    updatedAfter?: string;
    signal?: AbortSignal;
  }): Promise<ReadwiseReaderDocument[]> {
    const allDocs: ReadwiseReaderDocument[] = [];
    let cursor: string | null = null;

    do {
      const url = this.buildUrl(`${READER_API_V3}/list/`, {
        updatedAfter: options?.updatedAfter,
        pageCursor: cursor ?? undefined,
      });

      const response = await this.fetchWithRateLimit(url, options?.signal);
      const page = (await response.json()) as ReaderPageResponse;

      allDocs.push(...page.results);
      cursor = page.nextPageCursor;
    } while (cursor !== null);

    return allDocs;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Perform a GET request with the Readwise authorization header,
   * automatically retrying on HTTP 429 (rate limit) up to
   * {@link MAX_RETRIES} times.
   */
  private async fetchWithRateLimit(
    url: string,
    signal?: AbortSignal,
  ): Promise<HttpResponse> {
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw signal.reason as Error;
      }

      const response = await this.httpGet(url, {
        Authorization: `Token ${this.token}`,
      });

      const { status } = response;
      if ((status >= 200 && status < 300) || status === 204) {
        return response;
      }

      if (status === 429 && attempt < MAX_RETRIES) {
        attempt++;
        const retryAfter = this.parseRetryAfter(response);
        console.warn(
          `Readwise API rate limited (429). Retry ${attempt}/${MAX_RETRIES} after ${retryAfter}s.`,
        );
        await this.sleep(retryAfter * 1000, signal);
        continue;
      }

      throw new ReadwiseApiError(
        `Readwise API request failed: ${status} (${url})`,
        status,
        status === 429 ? this.parseRetryAfter(response) : undefined,
      );
    }
  }

  /** Build a URL with optional query parameters. */
  private buildUrl(
    base: string,
    params?: Record<string, string | undefined>,
  ): string {
    const url = new URL(base);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  }

  /** Parse the Retry-After header from a 429 response (case-insensitive). */
  private parseRetryAfter(response: HttpResponse): number {
    const header =
      response.headers['Retry-After'] ?? response.headers['retry-after'];
    if (header) {
      const seconds = parseInt(header, 10);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds;
      }
    }
    return DEFAULT_RETRY_SECONDS;
  }

  /** Promise-based sleep that respects AbortSignal. */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason as Error);
        return;
      }

      const timer = setTimeout(resolve, ms);

      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason as Error);
        },
        { once: true },
      );
    });
  }
}
