/**
 * HTTP client for the native Zotero local API (Zotero 7+), served by the
 * desktop app under `http://127.0.0.1:23119/api/`. Pure TypeScript — network
 * I/O is delegated to an injected transport function.
 *
 * Unlike the Better BibTeX endpoints, this API is built into Zotero itself:
 * no extensions are required. The user must enable it once via
 * Zotero Settings → Advanced → "Allow other applications on this computer to
 * communicate with Zotero" (when disabled the server answers HTTP 403).
 *
 * Implementation notes (verified against zotero/zotero server_localAPI.js):
 * - Requests carrying an `Origin` header or a `Mozilla/` user agent are
 *   silently dropped unless they include a `Zotero-Allowed-Request` header —
 *   sent on every request here.
 * - `start`/`limit` pagination with `Total-Results` headers is supported;
 *   there is no server-side max page size, but we page anyway to bound
 *   memory on huge libraries.
 * - `itemType=` filters use the web API search syntax; annotations and
 *   attachments are child items reachable via `itemType=attachment` etc.
 * - Responses include `Last-Modified-Version` (the library version).
 */

import { ZoteroApiError, ZoteroAbortError } from './zotero-client';
import type { ZoteroHttpGetFn, ZoteroHttpResponse } from './zotero-client';

/** Default origin of the Zotero local HTTP server. */
export const ZOTERO_LOCAL_API_DEFAULT_BASE = 'http://127.0.0.1:23119';

/** Item envelope returned by the local API (`format=json`). */
export interface ZoteroApiItem {
  key: string;
  version: number;
  /** Native item data (`itemType`, `title`, `creators`, `citationKey`, …). */
  data: Record<string, unknown>;
  /** CSL-JSON projection, present when requested via `include=csljson`. */
  csljson?: Record<string, unknown>;
  /** Zotero-computed metadata (`creatorSummary`, `parsedDate`, …). */
  meta?: Record<string, unknown>;
}

/** Everything the data source needs from one full library fetch. */
export interface ZoteroApiLibraryData {
  /** Top-level bibliographic items (no attachments/annotations/notes). */
  items: ZoteroApiItem[];
  /**
   * Attachment items for PDF link synthesis. When the fetch is
   * collection-scoped, already filtered to attachments of fetched items.
   */
  attachments: ZoteroApiItem[];
  /**
   * PDF annotation items (children of attachments). Empty unless the fetch
   * was made with `includeAnnotations`.
   */
  annotations: ZoteroApiItem[];
  /** Collection key → collection name. */
  collectionNames: Record<string, string>;
  /** `Last-Modified-Version` of the library at fetch time, or null. */
  libraryVersion: number | null;
}

/** Options selecting which part of the Zotero library to fetch. */
export interface ZoteroApiScope {
  /** Zotero group library id; omit for the personal library (`users/0`). */
  groupId?: string;
  /** Collection key to restrict the fetch to; omit for the whole library. */
  collectionKey?: string;
}

/** Result of {@link ZoteroLocalApiClient.ping}. */
export interface ZoteroApiPingResult {
  /** Total number of top-level items visible in the selected scope. */
  totalItems: number;
  /** `Zotero-API-Version` response header, if present. */
  apiVersion: string | null;
}

/** Page size for item fetches — bounds request/response sizes. */
const PAGE_LIMIT = 100;

export class ZoteroLocalApiClient {
  private readonly base: string;

  constructor(
    baseUrl: string | undefined,
    private get: ZoteroHttpGetFn,
  ) {
    const trimmed = (baseUrl ?? '').trim().replace(/\/+$/, '');
    this.base = trimmed.length > 0 ? trimmed : ZOTERO_LOCAL_API_DEFAULT_BASE;
  }

  /** Library path prefix for the configured scope. */
  private libraryPrefix(scope: ZoteroApiScope): string {
    return scope.groupId ? `groups/${scope.groupId}` : 'users/0';
  }

  /**
   * Probe the local API: confirms Zotero is running, the local API is
   * enabled, and reports how many items the scope contains.
   */
  async ping(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
  ): Promise<ZoteroApiPingResult> {
    const prefix = this.libraryPrefix(scope);
    const response = await this.request(
      `${this.base}/api/${prefix}/items/top?limit=1&format=json`,
      signal,
    );
    return {
      totalItems: ZoteroLocalApiClient.totalResults(response) ?? 0,
      apiVersion: ZoteroLocalApiClient.header(response, 'zotero-api-version'),
    };
  }

  /**
   * Fetch the full library scope: top-level items (with CSL-JSON
   * projections), all attachments, and the collection name map.
   */
  async fetchLibrary(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
    options: { includeAnnotations?: boolean } = {},
  ): Promise<ZoteroApiLibraryData> {
    const prefix = this.libraryPrefix(scope);
    const itemsPath = scope.collectionKey
      ? `${prefix}/collections/${scope.collectionKey}/items/top`
      : `${prefix}/items/top`;

    const { items, version } = await this.fetchAllPages(
      `${this.base}/api/${itemsPath}?format=json&include=csljson,data`,
      signal,
    );
    // Attachments are child items and never appear under /top; fetch them
    // library-wide in one paged sweep. For a collection-scoped fetch, drop
    // attachments whose parent was not fetched — they can never match an
    // entry and would only waste memory and normalization work downstream.
    const { items: allAttachments } = await this.fetchAllPages(
      `${this.base}/api/${prefix}/items?itemType=attachment&format=json`,
      signal,
    );
    const itemKeys = new Set(items.map((i) => i.key));
    const attachments = scope.collectionKey
      ? allAttachments.filter((a) => {
          const parent = (a.data as { parentItem?: unknown }).parentItem;
          return typeof parent === 'string' && itemKeys.has(parent);
        })
      : allAttachments;

    // PDF annotations are children of attachments; fetched on demand only,
    // and kept only when they belong to a fetched attachment.
    let annotations: ZoteroApiItem[] = [];
    if (options.includeAnnotations) {
      const { items: allAnnotations } = await this.fetchAllPages(
        `${this.base}/api/${prefix}/items?itemType=annotation&format=json`,
        signal,
      );
      const attachmentKeys = new Set(attachments.map((a) => a.key));
      annotations = allAnnotations.filter((a) => {
        const parent = (a.data as { parentItem?: unknown }).parentItem;
        return typeof parent === 'string' && attachmentKeys.has(parent);
      });
    }

    const collectionNames = await this.fetchCollectionNames(prefix, signal);

    return {
      items,
      attachments,
      annotations,
      collectionNames,
      libraryVersion: version,
    };
  }

  /**
   * Cheap change probe: the library's `Last-Modified-Version` from a
   * single-item request. Lets callers serve their cache and skip the full
   * re-fetch (items, attachments, annotations, collections) when the
   * library has not changed since the cached version.
   */
  async getLibraryVersion(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
  ): Promise<number | null> {
    const prefix = this.libraryPrefix(scope);
    const response = await this.request(
      `${this.base}/api/${prefix}/items/top?limit=1&format=json`,
      signal,
    );
    return ZoteroLocalApiClient.numericHeader(
      response,
      'last-modified-version',
    );
  }

  /** Page through a list endpoint using start/limit + Total-Results. */
  private async fetchAllPages(
    baseUrl: string,
    signal?: AbortSignal,
  ): Promise<{ items: ZoteroApiItem[]; version: number | null }> {
    const items: ZoteroApiItem[] = [];
    let start = 0;
    let total = Number.POSITIVE_INFINITY;
    let version: number | null = null;

    while (start < total) {
      const response = await this.request(
        `${baseUrl}&limit=${PAGE_LIMIT}&start=${start}`,
        signal,
      );
      const page = await response.json();
      if (!Array.isArray(page)) {
        throw new ZoteroApiError(
          'Zotero local API returned an unexpected (non-array) items response.',
        );
      }
      for (const item of page) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as { key?: unknown }).key === 'string'
        ) {
          items.push(item as ZoteroApiItem);
        }
      }

      version =
        ZoteroLocalApiClient.numericHeader(response, 'last-modified-version') ??
        version;
      const reportedTotal = ZoteroLocalApiClient.totalResults(response);
      total =
        reportedTotal ?? (page.length < PAGE_LIMIT ? items.length : total);
      start += PAGE_LIMIT;
      // Defensive stop: a server not reporting totals and returning a short
      // page means we reached the end.
      if (page.length < PAGE_LIMIT && reportedTotal === null) break;
    }

    return { items, version };
  }

  /** Fetch all collections and map key → name. */
  private async fetchCollectionNames(
    prefix: string,
    signal?: AbortSignal,
  ): Promise<Record<string, string>> {
    const names: Record<string, string> = {};
    const { items } = await this.fetchAllPages(
      `${this.base}/api/${prefix}/collections?format=json`,
      signal,
    );
    for (const collection of items) {
      const name = (collection.data as { name?: unknown }).name;
      if (typeof name === 'string') {
        names[collection.key] = name;
      }
    }
    return names;
  }

  /** Perform a GET with the headers the Zotero server requires. */
  private async request(
    url: string,
    signal?: AbortSignal,
  ): Promise<ZoteroHttpResponse> {
    if (signal?.aborted) throw new ZoteroAbortError();

    let response: ZoteroHttpResponse;
    try {
      response = await this.get(url, {
        Accept: 'application/json',
        // Without this header Zotero drops requests that look browser-made
        // (Origin header / Mozilla UA) with no response at all.
        'Zotero-Allowed-Request': 'true',
      });
    } catch (e) {
      throw new ZoteroApiError(
        `Could not reach Zotero at ${this.base}. Is Zotero (7 or later) running? (${
          e instanceof Error ? e.message : String(e)
        })`,
      );
    }

    if (signal?.aborted) throw new ZoteroAbortError();

    if (response.status === 403) {
      throw new ZoteroApiError(
        'Zotero rejected the request (HTTP 403). Enable "Allow other ' +
          'applications on this computer to communicate with Zotero" in ' +
          'Zotero Settings → Advanced.',
        403,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ZoteroApiError(
        `Zotero local API returned HTTP ${response.status} for ${url}.`,
        response.status,
      );
    }
    return response;
  }

  private static header(
    response: ZoteroHttpResponse,
    name: string,
  ): string | null {
    for (const [key, value] of Object.entries(response.headers)) {
      if (key.toLowerCase() === name) return value;
    }
    return null;
  }

  private static numericHeader(
    response: ZoteroHttpResponse,
    name: string,
  ): number | null {
    const raw = ZoteroLocalApiClient.header(response, name);
    if (raw === null) return null;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  }

  private static totalResults(response: ZoteroHttpResponse): number | null {
    return ZoteroLocalApiClient.numericHeader(response, 'total-results');
  }
}
