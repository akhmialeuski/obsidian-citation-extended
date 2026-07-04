jest.mock('obsidian', () => ({}), { virtual: true });

import {
  ZoteroLocalApiClient,
  ZOTERO_LOCAL_API_DEFAULT_BASE,
} from '../../../src/core/zotero/zotero-local-api-client';
import {
  ZoteroApiError,
  ZoteroAbortError,
} from '../../../src/core/zotero/zotero-client';
import type {
  ZoteroHttpGetFn,
  ZoteroHttpResponse,
} from '../../../src/core/zotero/zotero-client';

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): ZoteroHttpResponse {
  return {
    status,
    headers,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

function item(key: string, data: Record<string, unknown> = {}): unknown {
  return { key, version: 10, data };
}

describe('ZoteroLocalApiClient', () => {
  describe('constructor', () => {
    it('falls back to the default base URL for empty input', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, [], { 'Total-Results': '0' })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient('', get);

      await client.ping();

      expect(get.mock.calls[0][0]).toContain(ZOTERO_LOCAL_API_DEFAULT_BASE);
    });

    it('strips trailing slashes from a custom base URL', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, [], { 'Total-Results': '0' })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient('http://localhost:23120///', get);

      await client.ping();

      expect(get.mock.calls[0][0]).toMatch(
        /^http:\/\/localhost:23120\/api\/users\/0\/items\/top/,
      );
    });
  });

  describe('request headers', () => {
    it('sends the Zotero-Allowed-Request header on every request', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, [], { 'Total-Results': '0' })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await client.ping();

      expect(get.mock.calls[0][1]).toMatchObject({
        'Zotero-Allowed-Request': 'true',
      });
    });
  });

  describe('ping', () => {
    it('reports the item count and API version', async () => {
      const get = jest.fn(() =>
        Promise.resolve(
          response(200, [item('A')], {
            'Total-Results': '847',
            'Zotero-API-Version': '3',
          }),
        ),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      const result = await client.ping();

      expect(result).toEqual({ totalItems: 847, apiVersion: '3' });
    });

    it('uses the group prefix when a group id is given', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, [], { 'Total-Results': '0' })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await client.ping({ groupId: '4242' });

      expect(get.mock.calls[0][0]).toContain('/api/groups/4242/items/top');
    });

    it('maps HTTP 403 to the enable-local-API hint', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(403, 'Local API is not enabled')),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await expect(client.ping()).rejects.toThrow(/Allow other applications/);
    });

    it('maps connection failures to a friendly error', async () => {
      const get = jest.fn(() =>
        Promise.reject(new Error('net::ERR_CONNECTION_REFUSED')),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await expect(client.ping()).rejects.toThrow(/Is Zotero .* running/);
    });

    it('throws ZoteroAbortError when the signal is aborted', async () => {
      const get = jest.fn() as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);
      const controller = new AbortController();
      controller.abort();

      await expect(client.ping({}, controller.signal)).rejects.toThrow(
        ZoteroAbortError,
      );
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('fetchLibrary', () => {
    /** Route requests by URL substring. */
    function makeGet(
      routes: Array<{
        match: string;
        pages: Array<{ body: unknown; headers?: Record<string, string> }>;
      }>,
    ) {
      const counters = new Map<string, number>();
      return jest.fn((url: string) => {
        const route = routes.find((r) => url.includes(r.match));
        if (!route) return Promise.resolve(response(404, 'no route'));
        const n = counters.get(route.match) ?? 0;
        counters.set(route.match, n + 1);
        const page = route.pages[Math.min(n, route.pages.length - 1)];
        return Promise.resolve(response(200, page.body, page.headers ?? {}));
      }) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
    }

    it('fetches items, attachments, and collection names', async () => {
      const get = makeGet([
        {
          match: '/items/top',
          pages: [
            {
              body: [item('ITEM0001', { title: 'A Study' })],
              headers: {
                'Total-Results': '1',
                'Last-Modified-Version': '77',
              },
            },
          ],
        },
        {
          match: 'itemType=attachment',
          pages: [
            {
              body: [
                item('ATT00001', {
                  parentItem: 'ITEM0001',
                  linkMode: 'imported_file',
                  filename: 'paper.pdf',
                }),
              ],
              headers: { 'Total-Results': '1' },
            },
          ],
        },
        {
          match: '/collections',
          pages: [
            {
              body: [item('COLL0001', { name: 'My Collection' })],
              headers: { 'Total-Results': '1' },
            },
          ],
        },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary();

      expect(library.items).toHaveLength(1);
      expect(library.items[0].key).toBe('ITEM0001');
      expect(library.attachments).toHaveLength(1);
      expect(library.collectionNames).toEqual({ COLL0001: 'My Collection' });
      expect(library.libraryVersion).toBe(77);
      // include=csljson,data is requested for the bibliographic items.
      const itemsUrl = get.mock.calls.find((c) =>
        c[0].includes('/items/top'),
      )![0];
      expect(itemsUrl).toContain('include=csljson,data');
    });

    it('pages through large item lists using Total-Results', async () => {
      const pageOf = (offset: number, count: number) =>
        Array.from({ length: count }, (_, i) => item(`K${offset + i}`));
      const get = makeGet([
        {
          match: '/items/top',
          pages: [
            {
              body: pageOf(0, 100),
              headers: { 'Total-Results': '150' },
            },
            {
              body: pageOf(100, 50),
              headers: { 'Total-Results': '150' },
            },
          ],
        },
        {
          match: 'itemType=attachment',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
        {
          match: '/collections',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary();

      expect(library.items).toHaveLength(150);
      const itemCalls = get.mock.calls.filter((c) =>
        c[0].includes('/items/top'),
      );
      expect(itemCalls).toHaveLength(2);
      expect(itemCalls[0][0]).toContain('start=0');
      expect(itemCalls[1][0]).toContain('start=100');
    });

    it('stops on a short page when the server reports no totals', async () => {
      const get = makeGet([
        { match: '/items/top', pages: [{ body: [item('ONLY0001')] }] },
        { match: 'itemType=attachment', pages: [{ body: [] }] },
        { match: '/collections', pages: [{ body: [] }] },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary();

      expect(library.items).toHaveLength(1);
      expect(
        get.mock.calls.filter((c) => c[0].includes('/items/top')),
      ).toHaveLength(1);
    });

    it('scopes the item fetch to a collection when configured', async () => {
      const get = makeGet([
        {
          match: '/collections/ABCD1234/items/top',
          pages: [{ body: [item('X')], headers: { 'Total-Results': '1' } }],
        },
        {
          match: 'itemType=attachment',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
        {
          match: '/collections?',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary({
        collectionKey: 'ABCD1234',
      });

      expect(library.items).toHaveLength(1);
      expect(
        get.mock.calls.some((c) =>
          c[0].includes('/users/0/collections/ABCD1234/items/top'),
        ),
      ).toBe(true);
    });

    it('rejects a non-array items payload', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, { unexpected: true })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await expect(client.fetchLibrary()).rejects.toThrow(ZoteroApiError);
    });

    it('skips malformed items without a key', async () => {
      const get = makeGet([
        {
          match: '/items/top',
          pages: [
            {
              body: [item('GOOD0001'), null, 42, { data: {} }],
              headers: { 'Total-Results': '4' },
            },
          ],
        },
        {
          match: 'itemType=attachment',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
        {
          match: '/collections',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary();

      expect(library.items.map((i) => i.key)).toEqual(['GOOD0001']);
    });
  });
});
