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
