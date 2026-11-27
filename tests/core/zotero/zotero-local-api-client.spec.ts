jest.mock('obsidian', () => ({}), { virtual: true });

import {
  ZoteroLocalApiClient,
  ZoteroServerChangedError,
  ZoteroSnapshotError,
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
import {
  emptyZoteroLibrary,
  MockZoteroLocalApi,
  zoteroItem,
  zoteroResponse,
} from '../../helpers/zotero-local-api';

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

    it('scopes the probe to a collection when a collection key is given', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, [], { 'Total-Results': '5' })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await client.ping({ collectionKey: 'ABCD1234' });

      // The probe must hit the collection endpoint so a wrong/typo'd key fails
      // here instead of reporting a misleading library-wide count.
      expect(get.mock.calls[0][0]).toContain('/collections/ABCD1234/items/top');
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

    it('fetches every item when the server returns pages shorter than the limit', async () => {
      // A server (or proxy) whose page cap is below PAGE_LIMIT returns short
      // pages while Total-Results is larger. Advancing the cursor by the fixed
      // limit would skip the un-returned offsets; advancing by the actual page
      // size must fetch everything. This mock honours the `start` param.
      const TOTAL = 150;
      const SERVER_PAGE = 60;
      const get = jest.fn((url: string) => {
        if (url.includes('/items/top')) {
          const start = parseInt(url.match(/start=(\d+)/)?.[1] ?? '0', 10);
          const count = Math.min(SERVER_PAGE, Math.max(0, TOTAL - start));
          const body = Array.from({ length: count }, (_, i) =>
            item(`K${start + i}`),
          );
          return Promise.resolve(
            response(200, body, { 'Total-Results': String(TOTAL) }),
          );
        }
        return Promise.resolve(response(200, [], { 'Total-Results': '0' }));
      }) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary();

      expect(library.items).toHaveLength(TOTAL);
      // No offset was skipped or double-fetched.
      expect(new Set(library.items.map((i) => i.key)).size).toBe(TOTAL);
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

    it('drops attachments of unfetched parents on a collection-scoped fetch', async () => {
      const get = makeGet([
        {
          match: '/collections/ABCD1234/items/top',
          pages: [
            { body: [item('ITEM0001')], headers: { 'Total-Results': '1' } },
          ],
        },
        {
          match: 'itemType=attachment',
          pages: [
            {
              body: [
                item('ATTIN001', { parentItem: 'ITEM0001' }),
                item('ATTOUT01', { parentItem: 'ITEMELSE' }),
              ],
              headers: { 'Total-Results': '2' },
            },
          ],
        },
        {
          match: '/collections?',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary({ collectionKey: 'ABCD1234' });

      expect(library.attachments.map((a) => a.key)).toEqual(['ATTIN001']);
    });

    it('does not fetch annotations unless asked', async () => {
      const get = makeGet([
        {
          match: '/items/top',
          pages: [{ body: [item('A')], headers: { 'Total-Results': '1' } }],
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

      expect(library.annotations).toEqual([]);
      expect(
        get.mock.calls.some((c) => c[0].includes('itemType=annotation')),
      ).toBe(false);
    });

    it('fetches annotations and keeps only those of fetched attachments', async () => {
      const get = makeGet([
        {
          match: '/items/top',
          pages: [
            { body: [item('ITEM0001')], headers: { 'Total-Results': '1' } },
          ],
        },
        {
          match: 'itemType=attachment',
          pages: [
            {
              body: [item('ATT00001', { parentItem: 'ITEM0001' })],
              headers: { 'Total-Results': '1' },
            },
          ],
        },
        {
          match: 'itemType=annotation',
          pages: [
            {
              body: [
                item('ANN00001', { parentItem: 'ATT00001' }),
                item('ANNORPHN', { parentItem: 'ATTELSE1' }),
              ],
              headers: { 'Total-Results': '2' },
            },
          ],
        },
        {
          match: '/collections',
          pages: [{ body: [], headers: { 'Total-Results': '0' } }],
        },
      ]);
      const client = new ZoteroLocalApiClient(undefined, get);

      const library = await client.fetchLibrary({}, undefined, {
        includeAnnotations: true,
      });

      expect(library.annotations.map((a) => a.key)).toEqual(['ANN00001']);
    });
  });

  describe('getLibraryVersion', () => {
    it('returns the Last-Modified-Version from a one-item probe', async () => {
      const get = jest.fn(() =>
        Promise.resolve(
          response(200, [], {
            'Total-Results': '847',
            'Last-Modified-Version': '1234',
          }),
        ),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await expect(client.getLibraryVersion()).resolves.toBe(1234);
      expect(get.mock.calls[0][0]).toContain('limit=1');
    });

    it('returns null when the header is missing', async () => {
      const get = jest.fn(() =>
        Promise.resolve(response(200, [], { 'Total-Results': '0' })),
      ) as unknown as jest.MockedFunction<ZoteroHttpGetFn>;
      const client = new ZoteroLocalApiClient(undefined, get);

      await expect(client.getLibraryVersion()).resolves.toBeNull();
    });
  });

  describe('tracked reads', () => {
    const expected = { serverId: 'test-server', libraryVersion: 20 };

    it('probes mixed-case library headers without requesting a full record', async () => {
      const get = jest.fn<
        ReturnType<ZoteroHttpGetFn>,
        Parameters<ZoteroHttpGetFn>
      >(() =>
        Promise.resolve(
          response(
            200,
            {},
            {
              'zOtErO-sErVeR-iD': 'test-server',
              'last-MODIFIED-version': '20',
            },
          ),
        ),
      );
      const client = new ZoteroLocalApiClient('http://localhost:23120/', get);
      await expect(client.getLibraryState({ groupId: '42' })).resolves.toEqual(
        expected,
      );
      expect(get.mock.calls[0][0]).toBe(
        'http://localhost:23120/api/groups/42/items/top?limit=1&format=versions',
      );
    });

    it.each([undefined, '7oops', '-1', '1.5', '9007199254740992', ''])(
      'treats %p as an unavailable version',
      async (version) => {
        const headers = {
          'Zotero-Server-ID': 'test-server',
          'Zotero-API-Version': '3',
        };
        const get: ZoteroHttpGetFn = () =>
          Promise.resolve(
            response(
              200,
              {},
              {
                ...headers,
                ...(version === undefined
                  ? {}
                  : { 'Last-Modified-Version': version }),
              },
            ),
          );
        await expect(
          new ZoteroLocalApiClient(undefined, get).getLibraryState(),
        ).resolves.toEqual({
          serverId: 'test-server',
          libraryVersion: null,
        });
      },
    );

    it('reports a legacy version without a server ID', async () => {
      const get: ZoteroHttpGetFn = () =>
        Promise.resolve(
          response(
            200,
            {},
            {
              'Zotero-API-Version': '3',
              'Last-Modified-Version': '20',
            },
          ),
        );
      await expect(
        new ZoteroLocalApiClient(undefined, get).getLibraryState(),
      ).resolves.toEqual({
        serverId: null,
        libraryVersion: 20,
      });
    });

    it('reads complete and empty inventories with the server identity header', async () => {
      const api = new MockZoteroLocalApi({
        ...emptyZoteroLibrary(20),
        items: [zoteroItem('ITEM0001', 15), zoteroItem('ITEM0002', 20)],
      });
      const client = new ZoteroLocalApiClient(undefined, api.get);
      expect(await client.fetchOrderedItemKeys({}, 'items', expected)).toEqual([
        'ITEM0001',
        'ITEM0002',
      ]);
      expect(
        await client.fetchOrderedItemKeys({}, 'attachments', expected),
      ).toEqual([]);
      expect(
        api.requests.every(
          (request) =>
            request.headers['Zotero-Server-ID'] === expected.serverId,
        ),
      ).toBe(true);
    });

    it('rejects truncated delta pages and duplicated ordered inventories', async () => {
      const get: ZoteroHttpGetFn = (url) =>
        Promise.resolve(
          url.includes('format=keys')
            ? zoteroResponse(200, 'ITEM0001\nITEM0001', {
                'Total-Results': '2',
              })
            : response(200, [], { 'Total-Results': '2' }),
        );
      const client = new ZoteroLocalApiClient(undefined, get);
      await expect(
        client.fetchItemsSince({}, 'items', 14, expected),
      ).rejects.toThrow(/incomplete/);
      await expect(
        client.fetchOrderedItemKeys({}, 'items', expected),
      ).rejects.toThrow(/invalid/i);
    });

    it('rejects unnamed collections in a tracked snapshot and keeps the legacy fallback', async () => {
      const get: ZoteroHttpGetFn = () =>
        Promise.resolve(response(200, [item('COLL0001')]));
      const client = new ZoteroLocalApiClient(undefined, get);
      await expect(client.fetchCollectionNames({})).resolves.toEqual({});
      await expect(
        client.fetchCollectionNames({}, undefined, expected),
      ).rejects.toThrow(/collection without a name/);
    });

    it('filters group items since the saved version and advances by the actual page size', async () => {
      const items = Array.from({ length: 52 }, (_, i) =>
        zoteroItem('IT' + String(i).padStart(6, '0'), 15),
      );
      const api = new MockZoteroLocalApi({
        ...emptyZoteroLibrary(20),
        items: [zoteroItem('OLDER001', 14), ...items],
      });
      const get: ZoteroHttpGetFn = (address, headers) => {
        const url = new URL(address);
        url.searchParams.set('limit', '20');
        return api.get(url.href, headers);
      };
      const client = new ZoteroLocalApiClient(undefined, get);
      expect(
        await client.fetchItemsSince({ groupId: '42' }, 'items', 14, expected),
      ).toEqual(items);
      expect(
        api.requests.map(({ url }) => url.searchParams.get('start')),
      ).toEqual(['0', '20', '40']);
      expect(
        api.requests.every(
          ({ url }) =>
            url.pathname === '/api/groups/42/items/top' &&
            url.searchParams.get('include') === 'csljson,data' &&
            url.searchParams.get('since') === '14',
        ),
      ).toBe(true);
    });

    it('accepts Zotero version zero with the unfiltered since=0 cursor', async () => {
      const old = zoteroItem('ITEM0001', 0);
      const api = new MockZoteroLocalApi({
        ...emptyZoteroLibrary(20),
        items: [old],
      });
      const client = new ZoteroLocalApiClient(undefined, api.get);
      expect(await client.fetchItemsSince({}, 'items', 0, expected)).toEqual([
        old,
      ]);
    });

    it('preserves HTTP error status and cancels an in-flight read', async () => {
      const controller = new AbortController();
      const get: ZoteroHttpGetFn = () => Promise.resolve(response(503, {}));
      await expect(
        new ZoteroLocalApiClient(undefined, get).getLibraryState(),
      ).rejects.toMatchObject({ statusCode: 503 });
      const abortingGet: ZoteroHttpGetFn = () => {
        controller.abort();
        return get('', {});
      };
      await expect(
        new ZoteroLocalApiClient(undefined, abortingGet).fetchItemsSince(
          {},
          'items',
          14,
          expected,
          controller.signal,
        ),
      ).rejects.toThrow(ZoteroAbortError);
    });

    it.each([
      [412, null],
      [200, 'other-server'],
    ])(
      'reports a server identity mismatch with the actual HTTP %i status',
      async (status, serverId) => {
        const get = jest.fn<
          ReturnType<ZoteroHttpGetFn>,
          Parameters<ZoteroHttpGetFn>
        >(() =>
          Promise.resolve(
            response(
              status,
              [],
              serverId ? { 'Zotero-Server-ID': serverId } : {},
            ),
          ),
        );
        const client = new ZoteroLocalApiClient(undefined, get);
        const result = client.fetchItemsSince({}, 'items', 14, expected);
        await expect(result).rejects.toBeInstanceOf(ZoteroServerChangedError);
        await expect(result).rejects.toMatchObject({
          statusCode: status,
          serverId,
        });
        expect(get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            'Zotero-Server-ID': expected.serverId,
          }),
        );
      },
    );

    it('reports an advancing version on the same server as a snapshot error', async () => {
      const get: ZoteroHttpGetFn = () =>
        Promise.resolve(
          response(200, [], {
            'Zotero-Server-ID': expected.serverId,
            'Last-Modified-Version': String(expected.libraryVersion + 1),
          }),
        );
      const client = new ZoteroLocalApiClient(undefined, get);
      const result = client.fetchItemsSince({}, 'items', 14, expected);
      await expect(result).rejects.toBeInstanceOf(ZoteroSnapshotError);
      await expect(result).rejects.not.toBeInstanceOf(ZoteroServerChangedError);
      await expect(result).rejects.toMatchObject({
        statusCode: 200,
        serverId: expected.serverId,
      });
    });
  });
});
