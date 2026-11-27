import type {
  ZoteroApiItem,
  ZoteroApiLibraryData,
} from '../../src/core/zotero';
import type {
  ZoteroHttpGetFn,
  ZoteroHttpResponse,
} from '../../src/core/zotero';
import type { IFileSystem } from '../../src/platform/platform-adapter';

export type ZoteroList =
  'items' | 'attachments' | 'annotations' | 'collections';

interface ZoteroRequest {
  url: URL;
  headers: Record<string, string>;
  list: ZoteroList;
  format: string;
  records: number;
}

export class MockZoteroLocalApi {
  serverId: string | null = 'test-server';
  offline = false;
  requests: ZoteroRequest[] = [];
  bytes = 0;
  retrievalMs = 0;

  constructor(public library: ZoteroApiLibraryData) {}

  readonly get: ZoteroHttpGetFn = (address, headers) => {
    const startTime = performance.now();
    if (this.offline) return Promise.reject(new Error('Zotero is closed'));

    const url = new URL(address);
    const { searchParams: query } = url;
    const format = query.get('format') ?? 'json';
    const list = this.listFor(url);
    const versionHeaders = {
      'Last-Modified-Version': String(this.library.libraryVersion),
      'Zotero-API-Version': '3',
      ...(this.serverId ? { 'Zotero-Server-ID': this.serverId } : {}),
    };
    if (
      headers['Zotero-Server-ID'] &&
      headers['Zotero-Server-ID'] !== this.serverId
    ) {
      return Promise.resolve(
        zoteroResponse(412, 'Server ID mismatch', versionHeaders),
      );
    }

    let records = this.recordsFor(list);
    const since = Number(query.get('since') ?? 0);
    if (since > 0) records = records.filter((item) => item.version > since);
    const collectionKey = url.pathname.match(
      /\/collections\/([^/]+)\/items\/top$/,
    )?.[1];
    if (collectionKey) {
      records = records.filter((item) => {
        const collections = item.data.collections;
        return (
          Array.isArray(collections) && collections.includes(collectionKey)
        );
      });
    }
    const total = records.length;
    const start = Number(query.get('start') ?? 0);
    const limit = Number(query.get('limit') ?? total);
    const page = records.slice(start, start + limit);
    const body = this.serialize(page, format);
    this.bytes += Buffer.byteLength(body);
    this.retrievalMs += performance.now() - startTime;
    this.requests.push({
      url,
      headers,
      list,
      format,
      records: format === 'json' ? page.length : 0,
    });
    const response = zoteroResponse(200, body, {
      ...versionHeaders,
      'Total-Results': String(total),
    });
    return Promise.resolve({
      ...response,
      json: () => {
        const parseStart = performance.now();
        const parsed = response.json();
        this.retrievalMs += performance.now() - parseStart;
        return parsed;
      },
    });
  };

  resetMetrics(): void {
    this.requests = [];
    this.bytes = 0;
    this.retrievalMs = 0;
  }

  fullRecords(list: ZoteroList): number {
    return this.requests
      .filter((request) => request.list === list)
      .reduce((count, request) => count + request.records, 0);
  }

  private listFor(url: URL): ZoteroList {
    if (url.pathname.endsWith('/collections')) return 'collections';
    if (url.searchParams.get('itemType') === 'attachment') return 'attachments';
    if (url.searchParams.get('itemType') === 'annotation') return 'annotations';
    return 'items';
  }

  private recordsFor(list: ZoteroList): ZoteroApiItem[] {
    if (list !== 'collections') return this.library[list];
    return Object.entries(this.library.collectionNames).map(([key, name]) => ({
      key,
      data: { name },
      version: this.library.libraryVersion ?? 0,
    }));
  }

  private serialize(page: ZoteroApiItem[], format: string): string {
    if (format === 'keys') return page.map((item) => item.key).join('\n');
    if (format === 'versions') {
      return JSON.stringify(
        Object.fromEntries(page.map((item) => [item.key, item.version])),
        null,
        4,
      );
    }
    return JSON.stringify(page, null, 4);
  }
}

export function zoteroResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): ZoteroHttpResponse {
  return {
    status,
    headers,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
  };
}

export function mockZoteroCache(initial?: string) {
  const file = { content: initial };
  const fs: IFileSystem = {
    getBasePath: () => '',
    exists: () => Promise.resolve(file.content !== undefined),
    readFile: () => Promise.resolve(file.content ?? ''),
    writeFile: (_path, data) => {
      file.content = data;
      return Promise.resolve();
    },
  };
  return { fs, file };
}

export function zoteroItem(
  key: string,
  version = 1,
  data: Record<string, unknown> = {},
): ZoteroApiItem {
  return {
    key,
    version,
    data: {
      itemType: 'journalArticle',
      title: 'Article ' + key,
      creators: [
        { creatorType: 'author', lastName: 'Smith', firstName: 'Jane' },
      ],
      date: '2024',
      dateModified: '2026-11-07T15:05:46Z',
      ...data,
    },
  };
}

export function emptyZoteroLibrary(libraryVersion = 1): ZoteroApiLibraryData {
  return {
    libraryVersion,
    items: [],
    attachments: [],
    annotations: [],
    collectionNames: {},
  };
}
