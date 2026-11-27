/**
 * @jest-environment jsdom
 *
 * jsdom provides `window` for the polling timer in ZoteroApiSource.watch().
 */
jest.mock('obsidian', () => ({}), { virtual: true });

import { ZoteroApiSource } from '../../src/sources/zotero-api-source';
import {
  ZOTERO_LOCAL_API_DEFAULT_BASE,
  ZoteroApiError,
} from '../../src/core/zotero';
import type {
  ZoteroApiItem,
  ZoteroApiLibraryData,
  ZoteroApiLibraryState,
} from '../../src/core/zotero';
import { mockZoteroCache } from '../helpers/zotero-local-api';

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
    annotations: [],
    collectionNames: {},
    libraryVersion: 7,
  };
}

function makeClient(
  impl: () => Promise<ZoteroApiLibraryData>,
  versionImpl: () => Promise<number | null> = () => Promise.resolve(null),
  serverId: string | null = null,
) {
  const fetchLibrary = jest.fn(impl);
  return {
    baseUrl: ZOTERO_LOCAL_API_DEFAULT_BASE,
    fetchLibrary,
    pinnedTo: jest.fn(() => ({ fetchLibrary })),
    getLibraryState: jest.fn(async (): Promise<ZoteroApiLibraryState> => ({
      serverId,
      libraryVersion: await versionImpl(),
    })),
    ping: jest.fn(),
  } as never;
}

function fetchLibraryMock(client: unknown): jest.Mock {
  return (client as { fetchLibrary: jest.Mock }).fetchLibrary;
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

    expect(fetchLibraryMock(client)).toHaveBeenCalledWith(
      scope,
      expect.anything(),
      expect.objectContaining({ includeAnnotations: false }),
    );
  });

  it('requests annotations when annotation import is enabled', async () => {
    const client = makeClient(() => Promise.resolve(makeLibrary()));
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      undefined,
      undefined,
      undefined,
      true,
    );

    await source.load();

    expect(fetchLibraryMock(client)).toHaveBeenCalledWith(
      {},
      expect.anything(),
      expect.objectContaining({ includeAnnotations: true }),
    );
  });

  it('writes the fetched entries to the cache', async () => {
    const client = makeClient(() => Promise.resolve(makeLibrary()));
    const { fs, file } = mockZoteroCache();
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    await source.load();

    const cache = JSON.parse(file.content!) as {
      version: number;
      entries: unknown[];
      libraryVersion: number;
      groupId: string;
      collectionKey: string;
      importAnnotations: boolean;
    };
    expect(cache.version).toBe(3);
    expect(cache.entries).toHaveLength(2);
    expect(cache.libraryVersion).toBe(7);
    // Fetch parameters are recorded so a later scope/flag change invalidates.
    expect(cache.groupId).toBe('');
    expect(cache.collectionKey).toBe('');
    expect(cache.importAnnotations).toBe(false);
  });

  it('falls back to the cache when Zotero is unreachable', async () => {
    const goodClient = makeClient(() => Promise.resolve(makeLibrary()));
    const { fs } = mockZoteroCache();
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

  it('serves the cache without a full fetch when the library version is unchanged', async () => {
    const { fs } = mockZoteroCache();
    const seeder = new ZoteroApiSource(
      'za1',
      makeClient(
        () => Promise.resolve(makeLibrary()),
        () => Promise.resolve(7),
        'serverA',
      ),
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await seeder.load(); // cache now holds libraryVersion 7

    const client = makeClient(
      () => Promise.reject(new Error('full fetch must not run')),
      () => Promise.resolve(7),
      'serverA',
    );
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    const result = await source.load();

    expect(fetchLibraryMock(client)).not.toHaveBeenCalled();
    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(result.parseErrors).toEqual([]);
  });

  it('re-fetches when the library version has moved on', async () => {
    const { fs } = mockZoteroCache();
    const seeder = new ZoteroApiSource(
      'za1',
      makeClient(() => Promise.resolve(makeLibrary())),
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await seeder.load();

    const changed = {
      ...makeLibrary(),
      items: [makeItem('ITEM0003', 'new2026', 'Fresh')],
      libraryVersion: 8,
    };
    const client = makeClient(
      () => Promise.resolve(changed),
      () => Promise.resolve(8),
    );
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    const result = await source.load();

    expect(fetchLibraryMock(client)).toHaveBeenCalledTimes(1);
    expect(result.entries.map((e) => e.id)).toEqual(['new2026']);
  });

  it('re-fetches on a fullRefresh even when the library version is unchanged', async () => {
    const { fs } = mockZoteroCache();
    const seeder = new ZoteroApiSource(
      'za1',
      makeClient(() => Promise.resolve(makeLibrary())),
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await seeder.load();

    const client = makeClient(
      () => Promise.resolve(makeLibrary()),
      () => Promise.resolve(7),
    );
    const source = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
    );

    await source.load(undefined, { fullRefresh: true });

    // A manual refresh must bypass the version fast-path so a stale/wrong
    // cache is always recoverable.
    expect(fetchLibraryMock(client)).toHaveBeenCalledTimes(1);
  });

  it('ignores a cache written for a different scope', async () => {
    const { fs } = mockZoteroCache();
    // Seed a cache for the personal library at version 7.
    const seeder = new ZoteroApiSource(
      'za1',
      makeClient(() => Promise.resolve(makeLibrary())),
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await seeder.load();

    // A source scoped to a collection must NOT serve the personal-library
    // cache even though the (library-wide) version probe matches.
    const client = makeClient(
      () =>
        Promise.resolve({
          ...makeLibrary(),
          items: [makeItem('ITEM0009', 'coll2026', 'Scoped')],
        }),
      () => Promise.resolve(7),
    );
    const scoped = new ZoteroApiSource(
      'za1',
      client,
      { collectionKey: 'ABCD1234' },
      fs,
      '/cache/zotero-api.json',
    );

    const result = await scoped.load();

    expect(fetchLibraryMock(client)).toHaveBeenCalledTimes(1);
    expect(result.entries.map((e) => e.id)).toEqual(['coll2026']);
  });

  it('re-fetches when the annotation flag differs from the cache', async () => {
    const { fs } = mockZoteroCache();
    // Seed a cache WITHOUT annotations.
    const seeder = new ZoteroApiSource(
      'za1',
      makeClient(() => Promise.resolve(makeLibrary())),
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await seeder.load();

    const client = makeClient(
      () => Promise.resolve(makeLibrary()),
      () => Promise.resolve(7),
    );
    const withAnnotations = new ZoteroApiSource(
      'za1',
      client,
      {},
      fs,
      '/cache/zotero-api.json',
      undefined,
      true,
    );

    await withAnnotations.load();

    // Enabling annotations must force a re-fetch (the cached entries have
    // none) even though the library version is unchanged.
    expect(fetchLibraryMock(client)).toHaveBeenCalledWith(
      {},
      expect.anything(),
      expect.objectContaining({ includeAnnotations: true }),
    );
  });

  it('does not serve a different-scope cache on offline fallback', async () => {
    const { fs } = mockZoteroCache();
    const seeder = new ZoteroApiSource(
      'za1',
      makeClient(() => Promise.resolve(makeLibrary())),
      {},
      fs,
      '/cache/zotero-api.json',
    );
    await seeder.load();

    const failing = makeClient(
      () => Promise.reject(new ZoteroApiError('down')),
      () => Promise.reject(new ZoteroApiError('down')),
    );
    const scoped = new ZoteroApiSource(
      'za1',
      failing,
      { collectionKey: 'OTHERKEY' },
      fs,
      '/cache/zotero-api.json',
    );

    // The stale-scope cache must not be served — a wrong-collection library is
    // worse than a clear failure.
    await expect(scoped.load()).rejects.toThrow(
      /Failed to load from Zotero local API/,
    );
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

  it.each(['not-json{', 'null', '{}'])(
    'ignores a corrupt cache %p and reports the fetch error',
    async (invalid) => {
      const client = makeClient(() =>
        Promise.reject(new ZoteroApiError('down')),
      );
      const { fs } = mockZoteroCache(invalid);
      const source = new ZoteroApiSource(
        'za1',
        client,
        {},
        fs,
        '/cache/zotero-api.json',
      );

      await expect(source.load()).rejects.toThrow(/down/);
    },
  );
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
