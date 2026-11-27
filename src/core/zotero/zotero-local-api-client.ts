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
    statusCode?: number,
    serverId: string | null = null,
  ) {
    super(message, statusCode, serverId);
  }
}

/** The request reached a different Zotero instance than the snapshot expected. */
export class ZoteroServerChangedError extends ZoteroSnapshotError {}

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

function checkStableTotal(
  previous: number | null,
  reported: number | null,
): void {
  if (previous !== null && reported !== null && previous !== reported) {
    throw new ZoteroSnapshotError(
      'Zotero changed the result count during pagination.',
    );
  }
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
// Match Zotero's default ordering. The same search and sort must be used
// for the JSON and ordered key lists, including when dates tie.
const ITEM_SORT = 'sort=dateModified&direction=desc';

class ZoteroLibraryReader {
  readonly baseUrl: string;

  constructor(
    baseUrl: string | undefined,
    protected readonly get: ZoteroHttpGetFn,
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
  protected topItemsPath(scope: ZoteroApiScope): string {
    const prefix = this.libraryPrefix(scope);
    return scope.collectionKey
      ? `${prefix}/collections/${encodeURIComponent(scope.collectionKey)}/items/top`
      : `${prefix}/items/top`;
  }

  /** Fetch a full scope with top-level CSL projections, child items, and collection names. */
  async fetchLibrary(
    scope: ZoteroApiScope = {},
    signal?: AbortSignal,
    options: { includeAnnotations?: boolean } = {},
  ): Promise<ZoteroApiLibraryData> {
    const { items, version } = await this.fetchAllPages(
      this.itemListUrl(scope, 'items', 'json'),
      signal,
    );
    // Read attachments from the library-wide endpoint to include child
    // attachments. A collection-scoped fetch keeps only the fetched parents'
    // attachments so the adapter and cache carry only relevant child data.
    const { items: allAttachments } = await this.fetchAllPages(
      this.itemListUrl(scope, 'attachments', 'json'),
      signal,
    );
    const attachments = scope.collectionKey
      ? childrenOf(allAttachments, items)
      : allAttachments;

    let annotations: ZoteroApiItem[] = [];
    if (options.includeAnnotations) {
      const { items: allAnnotations } = await this.fetchAllPages(
        this.itemListUrl(scope, 'annotations', 'json'),
        signal,
      );
      // Keep the entire inventory for a tracked, unfiltered baseline. The
      // adapter links children only if their parent chain reaches an entry.
      const preserveInventory = !scope.collectionKey && this.tracksVersions;
      annotations = preserveInventory
        ? allAnnotations
        : childrenOf(allAnnotations, attachments);
    }

    return {
      items,
      attachments,
      annotations,
      collectionNames: await this.fetchCollectionNames(scope, signal),
      libraryVersion: version,
    };
  }

  /** Resolve current collection names independently of item versions. */
  async fetchCollectionNames(
    scope: ZoteroApiScope,
    signal?: AbortSignal,
  ): Promise<Record<string, string>> {
    const { items } = await this.fetchAllPages(
      `${this.baseUrl}/api/${this.libraryPrefix(scope)}/collections?format=json`,
      signal,
    );
    const names: Record<string, string> = {};
    for (const collection of items) {
      const name = collection.data.name;
      if (typeof name === 'string') names[collection.key] = name;
      else if (this.tracksVersions) {
        throw new ZoteroApiError(
          'Zotero returned a collection without a name.',
        );
      }
    }
    return names;
  }

  protected itemListUrl(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    format: 'json' | 'keys',
  ): string {
    const route =
      list === 'items'
        ? `${this.topItemsPath(scope)}?format=${format}`
        : `${this.libraryPrefix(scope)}/items?itemType=${list === 'attachments' ? 'attachment' : 'annotation'}&format=${format}`;
    const include =
      list === 'items' && format === 'json' ? '&include=csljson,data' : '';
    return `${this.baseUrl}/api/${route}${include}&${ITEM_SORT}`;
  }

  protected get requestServerId(): string | null {
    return null;
  }

  protected get tracksVersions(): boolean {
    return false;
  }

  protected async fetchAllPages(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ items: ZoteroApiItem[]; version: number | null }> {
    const items: ZoteroApiItem[] = [];
    const { version } = await this.readPages(
      url,
      (page) => {
        for (const item of page) {
          if (isZoteroRecord(item) && typeof item.key === 'string') {
            items.push(item as unknown as ZoteroApiItem);
          }
        }
      },
      signal,
    );
    return { items, version };
  }

  /** Share offset pagination between lenient and version-tracked readers. */
  protected async readPages(
    url: string,
    accept: (
      page: unknown[],
      previousTotal: number | null,
      reportedTotal: number | null,
    ) => void,
    signal?: AbortSignal,
  ): Promise<{ version: number | null; total: number | null }> {
    let start = 0;
    let version: number | null = null;
    let total: number | null = null;

    for (;;) {
      const response = await this.request(
        `${url}&limit=${PAGE_LIMIT}&start=${start}`,
        signal,
      );
      const page = await response.json();
      checkAborted(signal);
      if (!Array.isArray(page)) {
        throw new ZoteroApiError(
          'Zotero local API returned an unexpected (non-array) items response.',
        );
      }

      const reportedTotal = numericHeader(response, 'total-results');
      accept(page, total, reportedTotal);
      version = numericHeader(response, 'last-modified-version') ?? version;
      total = reportedTotal ?? total;
      // Advance by the records actually returned. A server or proxy with a
      // smaller page cap can return a short page followed by more results.
      start += page.length;
      if (!hasMoreResults(page.length, start, total)) break;
    }
    return { version, total };
  }

  protected async request(
    url: string,
    signal?: AbortSignal,
  ): Promise<ZoteroHttpResponse> {
    checkAborted(signal);
    const response = await this.sendRequest(url, signal, this.requestServerId);
    checkAborted(signal);
    this.validateResponse(response, url, readState(response));
    return response;
  }

  protected validateResponse(
    response: ZoteroHttpResponse,
    url: string,
    state: ZoteroApiLibraryState,
  ): void {
    this.checkStatus(response.status, url, state.serverId);
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

export class ZoteroLocalApiClient extends ZoteroLibraryReader {
  pinnedTo(state: ZoteroApiLibraryState): PinnedZoteroReader {
    return new PinnedZoteroReader(this.baseUrl, this.get, state);
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
}

/** A reader bound to one synchronization attempt and its probed state. */
export class PinnedZoteroReader extends ZoteroLibraryReader {
  readonly state: Readonly<ZoteroApiLibraryState>;

  constructor(
    baseUrl: string,
    get: ZoteroHttpGetFn,
    state: ZoteroApiLibraryState,
  ) {
    super(baseUrl, get);
    this.state = Object.freeze({ ...state });
  }

  protected override get requestServerId(): string | null {
    return this.state.serverId;
  }

  protected override get tracksVersions(): boolean {
    return supportsLocalVersions(this.state);
  }

  async fetchOrderedItemKeys(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const response = await this.request(
      this.itemListUrl(scope, list, 'keys'),
      signal,
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

  /** Read versions newer than the last successful library snapshot. */
  async fetchItemsSince(
    scope: ZoteroApiScope,
    list: ZoteroApiItemList,
    since: number,
    signal?: AbortSignal,
  ): Promise<ZoteroApiItem[]> {
    const { items } = await this.fetchAllPages(
      `${this.itemListUrl(scope, list, 'json')}&since=${since}`,
      signal,
    );
    const pinnedVersion = this.state.libraryVersion;
    if (
      pinnedVersion === null ||
      items.some((item) => item.version > pinnedVersion)
    ) {
      throw new ZoteroSnapshotError(
        'Zotero returned an item newer than the pinned library version.',
      );
    }
    return items;
  }

  protected override async fetchAllPages(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ items: ZoteroApiItem[]; version: number | null }> {
    if (!this.tracksVersions) return super.fetchAllPages(url, signal);
    const items: ZoteroApiItem[] = [];
    const seen = new Set<string>();
    const { version, total } = await this.readPages(
      url,
      (page, previous, reported) => {
        checkStableTotal(previous, reported);
        for (const item of page) items.push(this.parseRecord(item, seen));
      },
      signal,
    );
    checkInventoryCount(total, items.length);
    return { items, version };
  }

  private parseRecord(item: unknown, seen: Set<string>): ZoteroApiItem {
    if (!isZoteroApiItem(item) || seen.has(item.key)) {
      throw new ZoteroSnapshotError(
        'Zotero returned an invalid or duplicate object.',
      );
    }
    // Keep adapter inputs and drop the rest of the API envelope before
    // caching. In a delta, unchanged records are already compact.
    const { key, version, data, csljson, meta } = item;
    seen.add(key);
    return { key, version, data, csljson, meta };
  }

  protected override validateResponse(
    response: ZoteroHttpResponse,
    url: string,
    state: ZoteroApiLibraryState,
  ): void {
    const { serverId, libraryVersion } = state;
    this.checkIdentity(response.status, serverId);
    super.validateResponse(response, url, state);
    if (
      this.tracksVersions &&
      header(response, 'last-modified-version') !== null &&
      libraryVersion !== this.state.libraryVersion
    ) {
      throw new ZoteroSnapshotError(
        'Zotero library changed during synchronization.',
        response.status,
        serverId,
      );
    }
  }

  private checkIdentity(status: number, serverId: string | null): void {
    const expected = this.state.serverId;
    if (
      (status === 412 && expected !== null) ||
      (serverId !== null && serverId !== expected)
    ) {
      throw new ZoteroServerChangedError(
        'Zotero server identity changed during synchronization.',
        status,
        serverId,
      );
    }
  }
}
