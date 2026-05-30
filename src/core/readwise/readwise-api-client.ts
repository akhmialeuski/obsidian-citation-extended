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
// Internal pagination response shape
// ---------------------------------------------------------------------------

/** Common shape of a cursor-paginated Readwise response. */
interface PageResponse<T> {
  nextPageCursor: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const READWISE_API_V2 = 'https://readwise.io/api/v2';
const READER_API_V3 = 'https://readwise.io/api/v3';
const MAX_RETRIES = 3;
const DEFAULT_RETRY_SECONDS = 60;
/**
 * Upper bound on a server-supplied Retry-After (seconds). Caps how long a
 * single 429 can block so a misconfigured/hostile header cannot stall a load
 * far beyond the library-load timeout (worst case MAX_RETRIES × this).
 */
const MAX_RETRY_AFTER_SECONDS = 120;
/**
 * Hard safety backstop on the number of pages a single fetch will request.
 * The repeated-cursor guard in {@link ReadwiseApiClient.fetchAllPages} is the
 * primary protection against infinite pagination; this cap stops a server that
 * emits an endless stream of distinct cursors.
 */
const MAX_PAGINATION_PAGES = 10_000;

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
    return this.fetchAllPages<ReadwiseExportBook>(
      `${READWISE_API_V2}/export/`,
      options,
    );
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
    return this.fetchAllPages<ReadwiseReaderDocument>(
      `${READER_API_V3}/list/`,
      options,
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch every page of a cursor-paginated endpoint and concatenate results.
   *
   * Guards against malformed responses (invalid JSON or unexpected shape) by
   * throwing a {@link ReadwiseApiError}, and against infinite pagination by
   * stopping when the server repeats a cursor or exceeds
   * {@link MAX_PAGINATION_PAGES} pages.
   */
  private async fetchAllPages<T>(
    baseUrl: string,
    options?: { updatedAfter?: string; signal?: AbortSignal },
  ): Promise<T[]> {
    const all: T[] = [];
    const requestedCursors = new Set<string>();
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      if (cursor !== null) {
        if (requestedCursors.has(cursor)) {
          console.warn(
            'Readwise returned a repeated pagination cursor; stopping to avoid an infinite loop.',
          );
          break;
        }
        requestedCursors.add(cursor);
      }

      if (pageCount >= MAX_PAGINATION_PAGES) {
        console.warn(
          `Readwise pagination exceeded ${MAX_PAGINATION_PAGES} pages; stopping early.`,
        );
        break;
      }
      pageCount++;

      const url = this.buildUrl(baseUrl, {
        updatedAfter: options?.updatedAfter,
        pageCursor: cursor ?? undefined,
      });

      const response = await this.fetchWithRateLimit(url, options?.signal);
      const page = await this.parsePage<T>(response, url);

      all.push(...page.results);
      cursor = page.nextPageCursor;
    } while (cursor !== null);

    return all;
  }

  /**
   * Parse a paginated response body, validating that it is well-formed JSON
   * with a `results` array. Coerces a missing/invalid `nextPageCursor` to
   * `null` so pagination terminates rather than looping on garbage.
   */
  private async parsePage<T>(
    response: HttpResponse,
    url: string,
  ): Promise<PageResponse<T>> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ReadwiseApiError(
        `Malformed Readwise API response (invalid JSON) from ${url}`,
        response.status,
      );
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as { results?: unknown }).results)
    ) {
      throw new ReadwiseApiError(
        `Unexpected Readwise API response shape from ${url}`,
        response.status,
      );
    }

    const typed = body as { nextPageCursor?: unknown; results: T[] };
    return {
      nextPageCursor:
        typeof typed.nextPageCursor === 'string' ? typed.nextPageCursor : null,
      results: typed.results,
    };
  }

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
        // Clamp so a single 429 cannot block far beyond the load timeout.
        return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
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

      const timer = window.setTimeout(resolve, ms);

      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          reject(signal.reason as Error);
        },
        { once: true },
      );
    });
  }
}
