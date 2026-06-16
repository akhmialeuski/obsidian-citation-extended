// requestUrl is the only Obsidian dependency; capture the last call so we can
// assert method/headers/body and control the returned shape.
const requestUrl = jest.fn();
jest.mock(
  'obsidian',
  () => ({ requestUrl: (...a: unknown[]) => requestUrl(...a) }),
  {
    virtual: true,
  },
);

import {
  obsidianHttpGet,
  obsidianZoteroGet,
  obsidianZoteroPost,
} from '../../src/platform/obsidian-http';

beforeEach(() => requestUrl.mockReset());

describe('obsidianHttpGet', () => {
  it('issues a GET and exposes status/headers/json', async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: { 'x-test': '1' },
      json: { ok: true },
    });

    const res = await obsidianHttpGet('https://api.example.com', { A: 'b' });

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com',
        method: 'GET',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ 'x-test': '1' });
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe('obsidianZoteroGet', () => {
  it('issues a GET and exposes text() as well as json()', async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: {},
      text: '[{"id":"a"}]',
      json: [{ id: 'a' }],
    });

    const res = await obsidianZoteroGet('http://127.0.0.1:23119/x.json', {});

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', throw: false }),
    );
    await expect(res.text()).resolves.toBe('[{"id":"a"}]');
    await expect(res.json()).resolves.toEqual([{ id: 'a' }]);
  });
});

describe('obsidianZoteroPost', () => {
  it('issues a POST with the given body and headers', async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: {},
      text: '{}',
      json: { result: { zotero: '6', betterbibtex: '7' } },
    });

    const res = await obsidianZoteroPost(
      'http://127.0.0.1:23119/better-bibtex/json-rpc',
      '{"method":"api.ready"}',
      { 'Content-Type': 'application/json' },
    );

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: '{"method":"api.ready"}',
        throw: false,
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      result: { zotero: '6' },
    });
  });
});
