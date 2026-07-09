jest.mock('obsidian', () => ({}), { virtual: true });

import {
  ZoteroConnectorClient,
  ZoteroApiError,
  ZoteroAbortError,
} from '../../../src/core/zotero/zotero-client';
import type {
  ZoteroHttpResponse,
  ZoteroHttpGetFn,
  ZoteroHttpPostFn,
} from '../../../src/core/zotero/zotero-client';

const PULL_URL =
  'http://127.0.0.1:23119/better-bibtex/collection?/0/ABCD1234.json';

function jsonResponse(status: number, body: unknown): ZoteroHttpResponse {
  return {
    status,
    headers: {},
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

function textResponse(status: number, body: string): ZoteroHttpResponse {
  return {
    status,
    headers: {},
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  };
}

describe('ZoteroConnectorClient.fetchBibliography', () => {
  it('GETs the pull URL and returns the raw body', async () => {
    const get: ZoteroHttpGetFn = jest.fn(() =>
      Promise.resolve(textResponse(200, '[{"id":"smith2023"}]')),
    );
    const post: ZoteroHttpPostFn = jest.fn();
    const client = new ZoteroConnectorClient(PULL_URL, get, post);

    const body = await client.fetchBibliography();

    expect(body).toBe('[{"id":"smith2023"}]');
    expect(get).toHaveBeenCalledWith(PULL_URL, expect.any(Object));
  });

  it('appends exportNotes=true when requested', async () => {
    const get = jest.fn((_url: string, _headers: Record<string, string>) =>
      Promise.resolve(textResponse(200, '[]')),
    ) as jest.MockedFunction<ZoteroHttpGetFn>;
    const client = new ZoteroConnectorClient(PULL_URL, get, jest.fn());

    await client.fetchBibliography({ exportNotes: true });

    expect(get.mock.calls[0][0]).toBe(`${PULL_URL}&exportNotes=true`);
  });

  it('throws a friendly error on a non-2xx status', async () => {
    const get: ZoteroHttpGetFn = jest.fn(() =>
      Promise.resolve(textResponse(404, 'not found')),
    );
    const client = new ZoteroConnectorClient(PULL_URL, get, jest.fn());

    await expect(client.fetchBibliography()).rejects.toBeInstanceOf(
      ZoteroApiError,
    );
  });

  it('wraps a transport (network) error as ZoteroApiError', async () => {
    const get: ZoteroHttpGetFn = jest.fn(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    );
    const client = new ZoteroConnectorClient(PULL_URL, get, jest.fn());

    await expect(client.fetchBibliography()).rejects.toThrow(/Zotero/);
  });

  it('throws on an empty response body', async () => {
    const get: ZoteroHttpGetFn = jest.fn(() =>
      Promise.resolve(textResponse(200, '   ')),
    );
    const client = new ZoteroConnectorClient(PULL_URL, get, jest.fn());

    await expect(client.fetchBibliography()).rejects.toBeInstanceOf(
      ZoteroApiError,
    );
  });

  it('aborts before issuing the request when the signal is already aborted', async () => {
    const get = jest.fn((_url: string, _headers: Record<string, string>) =>
      Promise.resolve(textResponse(200, '[]')),
    ) as jest.MockedFunction<ZoteroHttpGetFn>;
    const client = new ZoteroConnectorClient(PULL_URL, get, jest.fn());
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.fetchBibliography({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(ZoteroAbortError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('ZoteroConnectorClient.ping', () => {
  it('POSTs api.ready to the derived JSON-RPC endpoint and returns versions', async () => {
    const post = jest.fn(
      (_url: string, _body: string, _headers: Record<string, string>) =>
        Promise.resolve(
          jsonResponse(200, {
            jsonrpc: '2.0',
            result: { zotero: '6.0.27', betterbibtex: '6.7.50' },
            id: 1,
          }),
        ),
    ) as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = new ZoteroConnectorClient(PULL_URL, jest.fn(), post);

    const versions = await client.ping();

    expect(versions).toEqual({ zotero: '6.0.27', betterbibtex: '6.7.50' });
    expect(post.mock.calls[0][0]).toBe(
      'http://127.0.0.1:23119/better-bibtex/json-rpc',
    );
    const sentBody = JSON.parse(post.mock.calls[0][1]);
    expect(sentBody.method).toBe('api.ready');
  });

  it('surfaces a JSON-RPC error payload', async () => {
    const post: ZoteroHttpPostFn = jest.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          jsonrpc: '2.0',
          error: { message: 'boom' },
          id: 1,
        }),
      ),
    );
    const client = new ZoteroConnectorClient(PULL_URL, jest.fn(), post);

    await expect(client.ping()).rejects.toThrow(/boom/);
  });

  it('throws ZoteroApiError when the export URL is invalid', async () => {
    const client = new ZoteroConnectorClient('not a url', jest.fn(), jest.fn());
    await expect(client.ping()).rejects.toBeInstanceOf(ZoteroApiError);
  });
});

describe('ZoteroConnectorClient.fetchAttachmentsForCitekeys', () => {
  const ATTACHMENT = {
    open: 'zotero://open-pdf/library/items/ATTKEY01',
    path: '/z/storage/ATTKEY01/paper.pdf',
    annotations: [{ key: 'A1', annotationType: 'highlight' }],
  };

  function makeClient(post: ZoteroHttpPostFn) {
    return new ZoteroConnectorClient(PULL_URL, jest.fn(), post);
  }

  it('returns an empty result without any request for no citekeys', async () => {
    const post = jest.fn();
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys([]);

    expect(result.attachmentsByCitekey.size).toBe(0);
    expect(result.errors).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('POSTs a JSON-RPC batch and maps results back to citekeys', async () => {
    const post = jest.fn((_url: string, body: string) => {
      const requests = JSON.parse(body) as Array<{
        id: number;
        method: string;
        params: [string];
      }>;
      expect(requests.every((r) => r.method === 'item.attachments')).toBe(true);
      return Promise.resolve(
        jsonResponse(
          200,
          requests.map((r) => ({
            jsonrpc: '2.0',
            id: r.id,
            result: r.params[0] === 'noatt2024' ? [] : [ATTACHMENT],
          })),
        ),
      );
    }) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys([
      'smith2023',
      'noatt2024',
    ]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe(
      'http://127.0.0.1:23119/better-bibtex/json-rpc',
    );
    expect(result.attachmentsByCitekey.get('smith2023')).toEqual([ATTACHMENT]);
    expect(result.attachmentsByCitekey.get('noatt2024')).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('splits large citekey lists into multiple batch requests', async () => {
    const citekeys = Array.from({ length: 120 }, (_, i) => `key${i}`);
    const post = jest.fn((_url: string, body: string) => {
      const requests = JSON.parse(body) as Array<{ id: number }>;
      expect(requests.length).toBeLessThanOrEqual(50);
      return Promise.resolve(
        jsonResponse(
          200,
          requests.map((r) => ({ jsonrpc: '2.0', id: r.id, result: [] })),
        ),
      );
    }) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys(citekeys);

    expect(post).toHaveBeenCalledTimes(3);
    expect(result.attachmentsByCitekey.size).toBe(120);
    expect(result.attachmentsByCitekey.get('key119')).toEqual([]);
  });

  it('collects per-citekey JSON-RPC errors without failing the fetch', async () => {
    const post = jest.fn((_url: string, body: string) => {
      const requests = JSON.parse(body) as Array<{
        id: number;
        params: [string];
      }>;
      return Promise.resolve(
        jsonResponse(
          200,
          requests.map((r) =>
            r.params[0] === 'broken'
              ? {
                  jsonrpc: '2.0',
                  id: r.id,
                  error: { code: -1, message: 'not found' },
                }
              : { jsonrpc: '2.0', id: r.id, result: [ATTACHMENT] },
          ),
        ),
      );
    }) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys([
      'ok2020',
      'broken',
    ]);

    expect(result.attachmentsByCitekey.has('ok2020')).toBe(true);
    expect(result.attachmentsByCitekey.has('broken')).toBe(false);
    expect(result.errors).toEqual([
      { citekey: 'broken', message: 'not found' },
    ]);
  });

  it('tolerates a bare (non-array) response for a single-request batch', async () => {
    const post = jest.fn((_url: string, _body: string) =>
      Promise.resolve(
        jsonResponse(200, { jsonrpc: '2.0', id: 0, result: [ATTACHMENT] }),
      ),
    ) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys(['solo2021']);

    expect(result.attachmentsByCitekey.get('solo2021')).toEqual([ATTACHMENT]);
  });

  it('ignores results whose id does not map to a citekey', async () => {
    const post = jest.fn((_url: string, _body: string) =>
      Promise.resolve(
        jsonResponse(200, [
          { jsonrpc: '2.0', id: 999, result: [ATTACHMENT] },
          { jsonrpc: '2.0', id: 'weird', result: [ATTACHMENT] },
        ]),
      ),
    ) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys(['only2020']);

    expect(result.attachmentsByCitekey.size).toBe(0);
  });

  it('maps a result whose id is a numeric STRING (proxy re-encoding)', async () => {
    const post = jest.fn((_url: string, _body: string) =>
      Promise.resolve(
        jsonResponse(200, [{ jsonrpc: '2.0', id: '0', result: [ATTACHMENT] }]),
      ),
    ) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys(['smith2023']);

    expect(result.attachmentsByCitekey.get('smith2023')).toEqual([ATTACHMENT]);
  });

  it('warns instead of silently dropping when a result id cannot be mapped', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const post = jest.fn((_url: string, _body: string) =>
      Promise.resolve(
        jsonResponse(200, [
          { jsonrpc: '2.0', id: 'nope', result: [ATTACHMENT] },
        ]),
      ),
    ) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    const result = await client.fetchAttachmentsForCitekeys(['a2020']);

    expect(result.attachmentsByCitekey.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unrecognized JSON-RPC id'),
    );
    warn.mockRestore();
  });

  it('throws ZoteroApiError on a non-2xx response', async () => {
    const post = jest.fn((_url: string, _body: string) =>
      Promise.resolve(jsonResponse(500, {})),
    ) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    await expect(client.fetchAttachmentsForCitekeys(['a2020'])).rejects.toThrow(
      ZoteroApiError,
    );
  });

  it('throws ZoteroApiError when the connection fails', async () => {
    const post = jest.fn((_url: string, _body: string) =>
      Promise.reject(new Error('ECONNREFUSED')),
    ) as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);

    await expect(client.fetchAttachmentsForCitekeys(['a2020'])).rejects.toThrow(
      /Could not reach Zotero/,
    );
  });

  it('throws ZoteroAbortError when the signal is already aborted', async () => {
    const post = jest.fn() as unknown as jest.MockedFunction<ZoteroHttpPostFn>;
    const client = makeClient(post);
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.fetchAttachmentsForCitekeys(['a2020'], {
        signal: controller.signal,
      }),
    ).rejects.toThrow(ZoteroAbortError);
    expect(post).not.toHaveBeenCalled();
  });
});
