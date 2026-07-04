/**
 * @jest-environment jsdom
 *
 * jsdom provides `window` for the polling timer in ZoteroApiSource.watch().
 */
jest.mock('obsidian', () => ({}), { virtual: true });

import { ZoteroApiSource } from '../../src/sources/zotero-api-source';
import { ZoteroApiError } from '../../src/core/zotero';
import type {
  ZoteroApiItem,
  ZoteroApiLibraryData,
} from '../../src/core/zotero';
import type { IFileSystem } from '../../src/platform/platform-adapter';

function makeItem(key: string, citekey: string, title: string): ZoteroApiItem {
  return {
    key,
    version: 1,
    data: {
      itemType: 'journalArticle',
      title,
      citationKey: citekey,
      creators: [],
    },
  };
}

function makeLibrary(): ZoteroApiLibraryData {
  return {
    items: [
      makeItem('ITEM0001', 'smith2023', 'A Study'),
      makeItem('ITEM0002', 'doe2024', 'A Book'),
    ],
    attachments: [],
    collectionNames: {},
    libraryVersion: 7,
  };
}

function makeClient(impl: () => Promise<ZoteroApiLibraryData>) {
  return {
    fetchLibrary: jest.fn(impl),
    ping: jest.fn(),
  } as never;
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

describe('ZoteroApiSource.load', () => {
  it('fetches the library and returns typed entries', async () => {
    const client = makeClient(() => Promise.resolve(makeLibrary()));
    const source = new ZoteroApiSource('za1', client, {});

    const result = await source.load();

    expect(result.sourceId).toBe('za1');
    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(result.entries[0].title).toBe('A Study');
    expect(result.parseErrors).toEqual([]);
  });

  it('passes the configured scope to the client', async () => {
    const client = makeClient(() => Promise.resolve(makeLibrary()));
    const scope = { groupId: '99', collectionKey: 'ABCD1234' };
    const source = new ZoteroApiSource('za1', client, scope);

    await source.load();

    expect(
      (client as unknown as { fetchLibrary: jest.Mock }).fetchLibrary,
    ).toHaveBeenCalledWith(scope, expect.anything());
  });

  it('writes the fetched entries to the cache', async () => {
    const client = makeClient(() => Promise.resolve(makeLibrary()));
    const { fs, written } = createMockFileSystem();
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    await source.load();

    const cache = JSON.parse(written.value!) as {
      version: number;
      entries: unknown[];
      libraryVersion: number;
    };
    expect(cache.version).toBe(1);
    expect(cache.entries).toHaveLength(2);
    expect(cache.libraryVersion).toBe(7);
  });

  it('falls back to the cache when Zotero is unreachable', async () => {
    const goodClient = makeClient(() => Promise.resolve(makeLibrary()));
    const { fs } = createMockFileSystem();
    const online = new ZoteroApiSource(
      'za1',
      goodClient,
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await online.load();

    const failingClient = makeClient(() =>
      Promise.reject(new ZoteroApiError('Could not reach Zotero')),
    );
    const offline = new ZoteroApiSource(
      'za1',
      failingClient,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    const result = await offline.load();

    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(result.parseErrors).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('using cache'),
      }),
    ]);
  });

  it('throws when Zotero is unreachable and no cache exists', async () => {
    const client = makeClient(() =>
      Promise.reject(new ZoteroApiError('Could not reach Zotero')),
    );
    const source = new ZoteroApiSource('za1', client, {});

    await expect(source.load()).rejects.toThrow(
      /Failed to load from Zotero local API/,
    );
  });

  it('ignores a corrupt cache and reports the fetch error', async () => {
    const client = makeClient(() => Promise.reject(new ZoteroApiError('down')));
    const { fs } = createMockFileSystem('not-json{');
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    await expect(source.load()).rejects.toThrow(/down/);
  });
});

describe('ZoteroApiSource.watch', () => {
  it('polls on the configured interval and stops on dispose', () => {
    jest.useFakeTimers();
    try {
      const client = makeClient(() => Promise.resolve(makeLibrary()));
      const source = new ZoteroApiSource(
        'za1',
        client,
        {},
        undefined,
        undefined,
        () => 1000,
      );
      const callback = jest.fn();

      source.watch(callback);
      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      source.dispose();
      jest.advanceTimersByTime(5000);
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not poll when no interval provider is given', () => {
    jest.useFakeTimers();
    try {
      const client = makeClient(() => Promise.resolve(makeLibrary()));
      const source = new ZoteroApiSource('za1', client, {});
      const callback = jest.fn();

      source.watch(callback);
      jest.advanceTimersByTime(60_000);

      expect(callback).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
