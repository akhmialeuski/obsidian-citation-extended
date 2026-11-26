/**
 * HTTP client for the native Zotero Local API (Zotero 7+), served by the
 * desktop app under `http://127.0.0.1:23119/api/`. Network I/O is delegated
 * to the injected transport so core synchronization is independent of Obsidian.
 *
 * The API is built into Zotero. Enable it under Settings → Advanced →
 * "Allow other applications on this computer to communicate with Zotero".
 * Zotero responds with HTTP 403 when the API is disabled.
 *
 * Implementation notes from Zotero's server_localAPI.js:
 * - Zotero can drop requests carrying an `Origin` header or a `Mozilla/`
 *   user agent. Send `Zotero-Allowed-Request` on every request.
 * - The Local API returns all matches by default. Full record reads use
 *   `start`, `limit`, and `Total-Results` to bound individual responses.
 * - The `itemType` filter uses Web API search syntax. Attachment and
 *   annotation inventories use separate filtered item lists.
 * - On Zotero 10+, `Zotero-Server-ID` identifies the Zotero instance and
 *   `Last-Modified-Version` on a list response is the library's local version.
 */

import {
  ZoteroApiError,
  ZoteroAbortError,
  ZOTERO_ALLOWED_REQUEST_HEADERS,
} from './zotero-client';
import type { ZoteroHttpGetFn, ZoteroHttpResponse } from './zotero-client';

/** Default origin of the Zotero local HTTP server. */
export const ZOTERO_LOCAL_API_DEFAULT_BASE = 'http://127.0.0.1:23119';

/** Item envelope returned by the Local API with `format=json`. */
export interface ZoteroApiItem {
  key: string;
  version: number;
  /** Native item data such as `itemType`, `creators`, and `citationKey`. */
  data: Record<string, unknown>;
  /** CSL projection requested via `include=csljson`. Zotero embeds the translator output as a string. */
  csljson?: string | Record<string, unknown>;
  /** Zotero-computed metadata such as `creatorSummary` and `parsedDate`. */
  meta?: Record<string, unknown>;
}

/** Raw adapter inputs from either a full fetch or a merged incremental fetch. */
export interface ZoteroApiLibraryData {
  /** API-ordered top-level items. The adapter selects bibliographic entries. */
  items: ZoteroApiItem[];
  /** Attachments for path synthesis, limited to fetched parents for a collection scope. */
  attachments: ZoteroApiItem[];
  /** Annotation items when enabled. A tracked whole-library snapshot keeps the complete inventory. */
  annotations: ZoteroApiItem[];
  /** Collection names keyed by Zotero collection key. */
  collectionNames: Record<string, string>;
  /** Library version at fetch time, or null when unavailable. */
  libraryVersion: number | null;
}

/** Options selecting which part of a Zotero library to fetch. */
export interface ZoteroApiScope {
  /** Zotero group library ID. Omit for the personal library (`users/0`). */
  groupId?: string;
  /** Collection key. Omit to fetch the whole library. */
  collectionKey?: string;
}

/** Result of {@link ZoteroLocalApiClient.ping}. */
export interface ZoteroApiPingResult {
  /** Total number of top-level items visible in the selected scope. */
  totalItems: number;
  /** Value of the `Zotero-API-Version` response header, if present. */
  apiVersion: string | null;
}

export interface ZoteroApiLibraryState {
  serverId: string | null;
  libraryVersion: number | null;
}

export type ZoteroApiItemList = 'items' | 'attachments' | 'annotations';

export class ZoteroLocalApiError extends ZoteroApiError {
  constructor(
    message: string,
    statusCode: number | undefined,
    readonly serverId: string | null,
  ) {
    super(message, statusCode);
  }
}

/** A failed attempt that may succeed against a fresh library state. */
export class ZoteroSnapshotError extends ZoteroLocalApiError {
  constructor(
    message: string,
    serverId: string | null = null,
    statusCode?: number,
  ) {
    super(message, statusCode, serverId);
  }
}

export function isZoteroRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isZoteroVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Older Zotero versions report remote sync versions. The server ID signals local version tracking. */
export function supportsLocalVersions(
  state: ZoteroApiLibraryState,
): state is { serverId: string; libraryVersion: number } {
  return state.serverId !== null && state.libraryVersion !== null;
}

function isObjectKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{8}$/.test(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isZoteroRecord(value);
}

export function isZoteroApiItem(value: unknown): value is ZoteroApiItem {
  return (
    isZoteroRecord(value) &&
    isObjectKey(value.key) &&
    isZoteroVersion(value.version) &&
    isZoteroRecord(value.data) &&
    (typeof value.csljson === 'string' || isOptionalRecord(value.csljson)) &&
    isOptionalRecord(value.meta)
  );
}

function header(response: ZoteroHttpResponse, name: string): string | null {
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}

function numericHeader(
  response: ZoteroHttpResponse,
  name: string,
): number | null {
  const raw = header(response, name);
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return isZoteroVersion(value) ? value : null;
}

function readState(response: ZoteroHttpResponse): ZoteroApiLibraryState {
  return {
    serverId: header(response, 'zotero-server-id')?.trim() || null,
    libraryVersion: numericHeader(response, 'last-modified-version'),
  };
}

function checkInventoryCount(total: number | null, count: number): void {
  if (total !== null && total !== count) {
    throw new ZoteroSnapshotError(
      'Zotero returned an incomplete item inventory.',
    );
  }
}

function updateTotal(
  previous: number | null,
  reported: number | null,
  strict: boolean,
): number | null {
  if (
    strict &&
    previous !== null &&
    reported !== null &&
    previous !== reported
  ) {
    throw new ZoteroSnapshotError(
      'Zotero changed the result count during pagination.',
    );
  }
  return reported ?? previous;
}

/**
 * An empty page ends pagination. A reported total takes precedence over page
 * length because a proxy may return short pages before the end of the list.
 * Tracked fetches still verify that the final count matches the reported total.
 */
function hasMoreResults(
  pageSize: number,
  offset: number,
  total: number | null,
): boolean {
  return (
    pageSize > 0 && (total === null ? pageSize >= PAGE_LIMIT : offset < total)
  );
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ZoteroAbortError();
}

function childrenOf(
  records: ZoteroApiItem[],
  parents: ZoteroApiItem[],
): ZoteroApiItem[] {
  const parentKeys = new Set(parents.map((parent) => parent.key));
  return records.filter(
    ({ data }) =>
      typeof data.parentItem === 'string' && parentKeys.has(data.parentItem),
  );
}

/** Page size for item fetches, which bounds individual response sizes. */
const PAGE_LIMIT = 100;
const KEY_BATCH_LIMIT = 50;
// Match Zotero's default ordering. The same search and sort must be used
// for the JSON and ordered key lists, including when dates tie.
const ITEM_SORT = 'sort=dateModified&direction=desc';

export class ZoteroLocalApiClient {
  readonly baseUrl: string;

  constructor(
    baseUrl: string | undefined,
    private get: ZoteroHttpGetFn,
  ) {
    this.baseUrl =
      baseUrl?.trim().replace(/\/+$/, '') || ZOTERO_LOCAL_API_DEFAULT_BASE;
  }

  private libraryPrefix(scope: ZoteroApiScope): string {
    return scope.groupId
      ? `groups/${encodeURIComponent(scope.groupId)}`
      : 'users/0';
  }

  /** Share the scoped endpoint between connection tests, version probes, and full fetches. */
  private topItemsPath(scope: ZoteroApiScope): string {
    const prefix = this.libraryPrefix(scope);
    return scope.collectionKey
      ? `${prefix}/collections/${encodeURIComponent(scope.collectionKey)}/items/top`
      : `${prefix}/items/top`;
  }

  /**
   * Confirm the Local API is reachable and count visible items. Probe the
   * configured collection when present so the count describes that scope.
   */
  async ping(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
  ): Promise<ZoteroApiPingResult> {
    const response = await this.request(
      `${this.baseUrl}/api/${this.topItemsPath(scope)}?limit=1&format=json`,
      signal,
    );
    return {
      totalItems: numericHeader(response, 'total-results') ?? 0,
      apiVersion: header(response, 'zotero-api-version'),
    };
  }

  /**
   * Read scoped library headers from a one-item version list. Zotero can
   * still enumerate matching items internally to answer the probe.
   */
  async getLibraryState(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
  ): Promise<ZoteroApiLibraryState> {
    const response = await this.request(
      `${this.baseUrl}/api/${this.topItemsPath(scope)}?limit=1&format=versions`,
      signal,
    );
    return readState(response);
  }

  async getLibraryVersion(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
  ): Promise<number | null> {
    return (await this.getLibraryState(scope, signal)).libraryVersion;
  }

  /** Fetch a full scope with top-level CSL projections, child items, and collection names. */
  async fetchLibrary(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
    options: {
      includeAnnotations?: boolean;
      expected?: ZoteroApiLibraryState;
    } = {},
  ): Promise<ZoteroApiLibraryData> {
    const { expected } = options;
    const { items, version } = await this.fetchAllPages(
      this.itemListUrl(scope, 'items', 'json'),
      signal,
      expected,
    );
    // Read attachments from the library-wide endpoint to include child
    // attachments. A collection-scoped fetch keeps only the fetched parents'
    // attachments so the adapter and cache carry only relevant child data.
    const { items: allAttachments } = await this.fetchAllPages(
      this.itemListUrl(scope, 'attachments', 'json'),
      signal,
      expected,
    );
    const attachments = scope.collectionKey
      ? childrenOf(allAttachments, items)
      : allAttachments;

    let annotations: ZoteroApiItem[] = [];
    if (options.includeAnnotations) {
      const { items: allAnnotations } = await this.fetchAllPages(
        this.itemListUrl(scope, 'annotations', 'json'),
        signal,
        expected,
      );
      // Keep the entire inventory for a tracked, unfiltered baseline. The
      // adapter links children only if their parent chain reaches an entry.
      const preserveInventory =
        !scope.collectionKey && expected && supportsLocalVersions(expected);
      annotations = preserveInventory
        ? allAnnotations
        : childrenOf(allAnnotations, attachments);
    }

    return {
      items,
      attachments,
      annotations,
      collectionNames: await this.fetchCollectionNames(scope, signal, expected),
      libraryVersion: version,
    };
  }

  async fetchItemVersions(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    expected: ZoteroApiLibraryState,
    signal?: AbortSignal,
  ): Promise<Map<string, number>> {
    const response = await this.request(
      this.itemListUrl(scope, list, 'versions'),
      signal,
      expected,
    );
    const data = await response.json();
    checkAborted(signal);
    if (!isZoteroRecord(data))
      throw new ZoteroApiError('Invalid Zotero item version map.');
    const versions = new Map<string, number>();
    for (const [key, version] of Object.entries(data)) {
      if (!isObjectKey(key) || !isZoteroVersion(version)) {
        throw new ZoteroApiError('Invalid Zotero item version map.');
      }
      versions.set(key, version);
    }
    checkInventoryCount(
      numericHeader(response, 'total-results'),
      versions.size,
    );
    return versions;
  }

  async fetchOrderedItemKeys(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    expected: ZoteroApiLibraryState,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const response = await this.request(
      this.itemListUrl(scope, list, 'keys'),
      signal,
      expected,
    );
    const body = (await response.text()).trim();
    checkAborted(signal);
    const keys = body ? body.split(/\r?\n/) : [];
    if (!keys.every(isObjectKey) || new Set(keys).size !== keys.length) {
      throw new ZoteroApiError('Invalid Zotero ordered item inventory.');
    }
    checkInventoryCount(numericHeader(response, 'total-results'), keys.length);
    return keys;
  }

  async fetchItemsByKey(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    versions: ReadonlyMap<string, number>,
    expected: ZoteroApiLibraryState,
    signal?: AbortSignal,
  ): Promise<ZoteroApiItem[]> {
    checkAborted(signal);
    const entries = [...versions];
    const records: ZoteroApiItem[] = [];
    for (let start = 0; start < entries.length; start += KEY_BATCH_LIMIT) {
      const batch = new Map(entries.slice(start, start + KEY_BATCH_LIMIT));
      const query = new URLSearchParams({
        itemKey: [...batch.keys()].join(','),
      });
      const { items } = await this.fetchAllPages(
        `${this.itemListUrl(scope, list, 'json')}&${query.toString()}`,
        signal,
        expected,
      );
      if (
        items.length !== batch.size ||
        items.some((item) => batch.get(item.key) !== item.version)
      ) {
        throw new ZoteroSnapshotError(
          'Zotero item response does not match the requested keys and versions.',
        );
      }
      records.push(...items);
    }
    return records;
  }

  /** Resolve current collection names independently of item versions. */
  async fetchCollectionNames(
    scope: ZoteroApiScope,
    signal?: AbortSignal,
    expected?: ZoteroApiLibraryState,
  ): Promise<Record<string, string>> {
    const { items } = await this.fetchAllPages(
      `${this.baseUrl}/api/${this.libraryPrefix(scope)}/collections?format=json`,
      signal,
      expected,
    );
    const names: Record<string, string> = {};
    for (const collection of items) {
      const name = collection.data.name;
      if (typeof name === 'string') names[collection.key] = name;
      else if (expected?.libraryVersion != null) {
        throw new ZoteroApiError(
          'Zotero returned a collection without a name.',
        );
      }
    }
    return names;
  }

  private itemListUrl(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    format: 'json' | 'keys' | 'versions',
  ): string {
    const route =
      list === 'items'
        ? `${this.topItemsPath(scope)}?format=${format}`
        : `${this.libraryPrefix(scope)}/items?itemType=${list === 'attachments' ? 'attachment' : 'annotation'}&format=${format}`;
    const include =
      list === 'items' && format === 'json' ? '&include=csljson,data' : '';
    return `${this.baseUrl}/api/${route}${include}&${ITEM_SORT}`;
  }

  /** Keep the existing offset pagination for full fetches and short pages. */
  private async fetchAllPages(
    url: string,
    signal?: AbortSignal,
    expected?: ZoteroApiLibraryState,
  ): Promise<{ items: ZoteroApiItem[]; version: number | null }> {
    const items: ZoteroApiItem[] = [];
    const seen = expected?.libraryVersion == null ? null : new Set<string>();
    let start = 0;
    let version: number | null = null;
    let total: number | null = null;

    for (;;) {
      const response = await this.request(
        `${url}&limit=${PAGE_LIMIT}&start=${start}`,
        signal,
        expected,
      );
      const page = await response.json();
      checkAborted(signal);
      if (!Array.isArray(page)) {
        throw new ZoteroApiError(
          'Zotero local API returned an unexpected (non-array) items response.',
        );
      }
      this.appendPage(page, items, seen);

      version = numericHeader(response, 'last-modified-version') ?? version;
      total = updateTotal(
        total,
        numericHeader(response, 'total-results'),
        seen !== null,
      );
      // Advance by the records actually returned. A server or proxy with a
      // smaller page cap can return a short page followed by more results.
      start += page.length;
      if (!hasMoreResults(page.length, start, total)) break;
    }
    if (seen) checkInventoryCount(total, items.length);
    return { items, version };
  }

  private appendPage(
    page: unknown[],
    items: ZoteroApiItem[],
    seen: Set<string> | null,
  ): void {
    for (const item of page) {
      if (seen) {
        if (!isZoteroApiItem(item) || seen.has(item.key)) {
          throw new ZoteroSnapshotError(
            'Zotero returned an invalid or duplicate object.',
          );
        }
        // Keep adapter inputs and drop the rest of the API envelope before
        // caching. In a delta, unchanged records are already compact.
        const { key, version, data, csljson, meta } = item;
        seen.add(key);
        items.push({ key, version, data, csljson, meta });
      } else if (isZoteroRecord(item) && typeof item.key === 'string') {
        items.push(item as unknown as ZoteroApiItem);
      }
    }
  }

  private async request(
    url: string,
    signal?: AbortSignal,
    expected?: ZoteroApiLibraryState,
  ): Promise<ZoteroHttpResponse> {
    checkAborted(signal);
    const response = await this.sendRequest(url, signal, expected?.serverId);
    checkAborted(signal);
    const { serverId, libraryVersion } = readState(response);
    this.checkIdentity(response.status, serverId, expected);
    this.checkStatus(response.status, url, serverId);
    if (
      expected?.libraryVersion != null &&
      header(response, 'last-modified-version') !== null &&
      libraryVersion !== expected.libraryVersion
    ) {
      throw new ZoteroSnapshotError(
        'Zotero library changed during synchronization.',
        serverId,
      );
    }
    return response;
  }

  /** Send Zotero's required request header and pin the instance when known. */
  private async sendRequest(
    url: string,
    signal?: AbortSignal,
    serverId?: string | null,
  ): Promise<ZoteroHttpResponse> {
    try {
      return await this.get(url, {
        ...ZOTERO_ALLOWED_REQUEST_HEADERS,
        Accept: 'application/json, text/plain',
        ...(serverId ? { 'Zotero-Server-ID': serverId } : {}),
      });
    } catch (error) {
      checkAborted(signal);
      const message = error instanceof Error ? error.message : String(error);
      throw new ZoteroApiError(
        `Could not reach Zotero at ${this.baseUrl}. Is Zotero (7 or later) running? (${message})`,
      );
    }
  }

  private checkIdentity(
    status: number,
    serverId: string | null,
    expected?: ZoteroApiLibraryState,
  ): void {
    if (
      expected &&
      ((status === 412 && expected.serverId !== null) ||
        (serverId !== null && serverId !== expected.serverId))
    ) {
      throw new ZoteroSnapshotError(
        'Zotero server identity changed during synchronization.',
        serverId,
        412,
      );
    }
  }

  private checkStatus(
    status: number,
    url: string,
    serverId: string | null,
  ): void {
    if (status === 403) {
      throw new ZoteroLocalApiError(
        'Zotero rejected the request (HTTP 403). Enable "Allow other ' +
          'applications on this computer to communicate with Zotero" in ' +
          'Zotero Settings → Advanced.',
        status,
        serverId,
      );
    }
    if (status < 200 || status >= 300) {
      throw new ZoteroLocalApiError(
        `Zotero local API returned HTTP ${status} for ${url}.`,
        status,
        serverId,
      );
    }
  }
}
