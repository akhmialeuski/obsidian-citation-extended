/**
 * @jest-environment jsdom
 *
 * jsdom provides `window` for the polling timer in ZoteroSource.watch().
 */
jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import { ZoteroSource } from '../../src/sources/zotero-source';
import { ZoteroApiError, ZoteroAbortError } from '../../src/core/zotero';
import { DATABASE_FORMATS } from '../../src/core/types/database';
import { loadEntries } from '../../src/core/parsing/entry-parser';
import type { IFileSystem } from '../../src/platform/platform-adapter';

/** Worker manager mock that parses with the real loadEntries pipeline. */
function createMockWorkerManager() {
  return {
    post: jest
      .fn()
      .mockImplementation((msg: { databaseRaw: string; databaseType: never }) =>
        Promise.resolve(loadEntries(msg.databaseRaw, msg.databaseType)),
      ),
  };
}

function createMockFileSystem(initial?: string): {
  fs: IFileSystem;
  written: { value?: string };
} {
  const written: { value?: string } = { value: initial };
  const fs = {
    exists: jest.fn(() => Promise.resolve(written.value !== undefined)),
    readFile: jest.fn(() => Promise.resolve(written.value ?? '')),
    writeFile: jest.fn((_p: string, data: string) => {
      written.value = data;
      return Promise.resolve();
    }),
  } as unknown as IFileSystem;
  return { fs, written };
}

const CSL = JSON.stringify([
  { id: 'smith2023', type: 'article-journal', title: 'A Study' },
  { id: 'doe2024', type: 'book', title: 'A Book' },
]);

function makeClient(impl: () => Promise<string>) {
  return {
    fetchBibliography: jest.fn(impl),
    ping: jest.fn(),
  } as never;
}

describe('ZoteroSource.load', () => {
  it('fetches, parses CSL JSON, and returns typed entries', async () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
    );

    const result = await source.load();

    expect(result.sourceId).toBe('z1');
    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(worker.post).toHaveBeenCalledTimes(1);
  });

  it('passes the exportNotes flag through to the client', async () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      true,
    );

    await source.load();

    expect(
      (client as unknown as { fetchBibliography: jest.Mock }).fetchBibliography,
    ).toHaveBeenCalledWith(expect.objectContaining({ exportNotes: true }));
  });

  it('writes the successful export to the cache', async () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const { fs, written } = createMockFileSystem();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
    );

    await source.load();

    expect(fs.writeFile).toHaveBeenCalled();
    expect(JSON.parse(written.value!)).toMatchObject({
      version: 1,
      format: DATABASE_FORMATS.CslJson,
      raw: CSL,
    });
  });

  it('falls back to the cache when Zotero is unreachable', async () => {
    const cache = JSON.stringify({
      version: 1,
      format: DATABASE_FORMATS.CslJson,
      raw: CSL,
    });
    const client = makeClient(() =>
      Promise.reject(new ZoteroApiError('Could not reach Zotero')),
    );
    const worker = createMockWorkerManager();
    const { fs } = createMockFileSystem(cache);
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
    );

    const result = await source.load();

    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(result.parseErrors?.[0].message).toMatch(/using cache/);
  });

  it('throws when Zotero is unreachable and no cache exists', async () => {
    const client = makeClient(() =>
      Promise.reject(new ZoteroApiError('Could not reach Zotero')),
    );
    const worker = createMockWorkerManager();
    const { fs } = createMockFileSystem();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
    );

    await expect(source.load()).rejects.toThrow(/Failed to load from Zotero/);
  });

  it('propagates an abort without caching it as a failure', async () => {
    const client = makeClient(() => Promise.reject(new ZoteroAbortError()));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
    );

    await expect(source.load()).rejects.toBeInstanceOf(ZoteroAbortError);
  });
});

describe('ZoteroSource.dispose', () => {
  it('does not throw and stops the polling timer', () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      undefined,
      undefined,
      () => 60_000,
    );
    source.watch(jest.fn());
    expect(() => source.dispose()).not.toThrow();
  });
});
