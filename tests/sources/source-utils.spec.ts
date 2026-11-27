jest.mock('obsidian', () => ({}), { virtual: true });

import {
  readVersionedJsonCache,
  sourceCacheFilePath,
  writeVersionedJsonCache,
} from '../../src/sources/source-utils';
import type { IFileSystem } from '../../src/platform/platform-adapter';

describe('sourceCacheFilePath', () => {
  it('derives the filename from the stable database id, not the source key', () => {
    // Two source keys for the SAME database (a config-flag toggle recreated
    // the source with a new key) must resolve to the SAME cache file so the
    // offline cache is not orphaned.
    const a = sourceCacheFilePath(
      '/plugin',
      'zotero-cache',
      'db-123',
      'zotero:csl-json:db-123:url:notes-0',
    );
    const b = sourceCacheFilePath(
      '/plugin',
      'zotero-cache',
      'db-123',
      'zotero:csl-json:db-123:url:notes-0:annot-1',
    );
    expect(a).toBe('/plugin/zotero-cache-db-123.json');
    expect(a).toBe(b);
  });

  it('gives distinct databases distinct cache files', () => {
    const a = sourceCacheFilePath('/p', 'zotero-cache', 'db-1', 'k1');
    const b = sourceCacheFilePath('/p', 'zotero-cache', 'db-2', 'k2');
    expect(a).not.toBe(b);
  });

  it('falls back to the source key when no database id is present', () => {
    expect(
      sourceCacheFilePath('/p', 'zotero-cache', undefined, 'legacy:key'),
    ).toBe('/p/zotero-cache-legacy-key.json');
  });

  it('sanitizes characters not allowed in a filename', () => {
    expect(
      sourceCacheFilePath('/p', 'zotero-cache', 'db/../weird:id', 'k'),
    ).toBe('/p/zotero-cache-db----weird-id.json');
  });

  it('returns an empty string when caching is disabled (no directory)', () => {
    expect(sourceCacheFilePath('', 'zotero-cache', 'db-1', 'k')).toBe('');
  });

  it('supports the readwise-cache prefix, keyed by the stable database id', () => {
    // Readwise sources were migrated onto this helper so their offline cache
    // survives filter toggles and source-key shape changes (previously the
    // cache was keyed by the volatile source key and orphaned on both).
    expect(
      sourceCacheFilePath('/dir', 'readwise-cache', 'db-1', 'source-key'),
    ).toBe('/dir/readwise-cache-db-1.json');

    const beforeToggle = sourceCacheFilePath(
      '/dir',
      'readwise-cache',
      'db-1',
      'key-v1',
    );
    const afterToggle = sourceCacheFilePath(
      '/dir',
      'readwise-cache',
      'db-1',
      'key-v2',
    );
    expect(beforeToggle).toBe(afterToggle);
  });
});

interface CacheV1 {
  version: 1;
  entries: string[];
}

function isCacheV1(parsed: unknown): parsed is CacheV1 {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    (parsed as { version?: unknown }).version === 1 &&
    Array.isArray((parsed as { entries?: unknown }).entries)
  );
}

function makeFs(initial?: string): {
  fs: IFileSystem;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('/cache.json', initial);
  const fs = {
    exists: jest.fn((path: string) => Promise.resolve(store.has(path))),
    readFile: jest.fn((path: string) => {
      const value = store.get(path);
      if (value === undefined) return Promise.reject(new Error('missing'));
      return Promise.resolve(value);
    }),
    writeFile: jest.fn((path: string, data: string) => {
      store.set(path, data);
      return Promise.resolve();
    }),
  } as unknown as IFileSystem;
  return { fs, store };
}

describe('readVersionedJsonCache', () => {
  const VALID = JSON.stringify({ version: 1, entries: ['a'] });

  it('returns the parsed state when it validates', async () => {
    const { fs } = makeFs(VALID);
    const state = await readVersionedJsonCache(fs, '/cache.json', isCacheV1);
    expect(state).toEqual({ version: 1, entries: ['a'] });
  });

  it('returns null without a file system or path', async () => {
    const { fs } = makeFs(VALID);
    expect(await readVersionedJsonCache(undefined, '/x', isCacheV1)).toBeNull();
    expect(await readVersionedJsonCache(fs, undefined, isCacheV1)).toBeNull();
    expect(await readVersionedJsonCache(fs, '', isCacheV1)).toBeNull();
  });

  it('returns null for a missing file', async () => {
    const { fs } = makeFs();
    expect(
      await readVersionedJsonCache(fs, '/cache.json', isCacheV1),
    ).toBeNull();
  });

  it('returns null for unparseable JSON', async () => {
    const { fs } = makeFs('not-json{');
    expect(
      await readVersionedJsonCache(fs, '/cache.json', isCacheV1),
    ).toBeNull();
  });

  it('returns null when the validator rejects the shape', async () => {
    const { fs } = makeFs(JSON.stringify({ version: 99 }));
    expect(
      await readVersionedJsonCache(fs, '/cache.json', isCacheV1),
    ).toBeNull();
  });

  it('returns null when reading throws', async () => {
    const { fs } = makeFs(VALID);
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('io'));
    expect(
      await readVersionedJsonCache(fs, '/cache.json', isCacheV1),
    ).toBeNull();
  });
});

describe('writeVersionedJsonCache', () => {
  const path = '/cache.json';
  const state = (entry: string) => ({ version: 1, entries: [entry] });

  function deferWrite(fs: IFileSystem, store: Map<string, string>) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.mocked(fs.writeFile).mockImplementationOnce(async (path, data) => {
      await gate;
      store.set(path, data);
    });
    return release;
  }

  it('serializes and writes the state', async () => {
    const { fs, store } = makeFs();
    expect(
      await writeVersionedJsonCache(fs, '/cache.json', {
        version: 1,
        entries: ['a'],
      }),
    ).toBe(true);
    expect(JSON.parse(store.get('/cache.json')!)).toEqual({
      version: 1,
      entries: ['a'],
    });
  });

  it('is a no-op without a file system or path', async () => {
    const { fs } = makeFs();
    expect(await writeVersionedJsonCache(undefined, '/x', {})).toBe(false);
    expect(await writeVersionedJsonCache(fs, undefined, {})).toBe(false);
    expect(await writeVersionedJsonCache(fs, '', {})).toBe(false);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('reports write failure and allows subsequent reads and writes', async () => {
    const { fs } = makeFs(JSON.stringify(state('prior')));
    jest.mocked(fs.writeFile).mockRejectedValueOnce(new Error('disk full'));
    const failed = writeVersionedJsonCache(fs, path, state('failed'));
    const read = readVersionedJsonCache(fs, path, isCacheV1);
    await expect(failed).resolves.toBe(false);
    await expect(read).resolves.toEqual(state('prior'));
    await expect(
      writeVersionedJsonCache(fs, path, state('next')),
    ).resolves.toBe(true);
    await expect(readVersionedJsonCache(fs, path, isCacheV1)).resolves.toEqual(
      state('next'),
    );
  });

  it('serializes writes and makes existing and new reads wait for the latest writer', async () => {
    const { fs, store } = makeFs();
    const releaseFirst = deferWrite(fs, store);
    const releaseSecond = deferWrite(fs, store);
    const first = writeVersionedJsonCache(fs, path, state('first'));
    const earlyRead = readVersionedJsonCache(fs, path, isCacheV1);
    const second = writeVersionedJsonCache(fs, path, state('second'));
    await Promise.resolve();
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.exists).not.toHaveBeenCalled();
    releaseFirst();
    await expect(first).resolves.toBe(true);
    const lateRead = readVersionedJsonCache(fs, path, isCacheV1);
    expect(fs.exists).not.toHaveBeenCalled();
    releaseSecond();
    await expect(second).resolves.toBe(true);
    await expect(earlyRead).resolves.toEqual(state('second'));
    await expect(lateRead).resolves.toEqual(state('second'));
  });

  it('lets other paths and filesystem instances read and write independently', async () => {
    const { fs, store } = makeFs();
    const other = makeFs().fs;
    const release = deferWrite(fs, store);
    const pending = writeVersionedJsonCache(fs, path, state('pending'));
    await expect(
      writeVersionedJsonCache(fs, '/other.json', state('other path')),
    ).resolves.toBe(true);
    await expect(
      writeVersionedJsonCache(other, path, state('other fs')),
    ).resolves.toBe(true);
    await expect(
      readVersionedJsonCache(fs, '/other.json', isCacheV1),
    ).resolves.toEqual(state('other path'));
    await expect(
      readVersionedJsonCache(other, path, isCacheV1),
    ).resolves.toEqual(state('other fs'));
    release();
    await expect(pending).resolves.toBe(true);
  });

  it('skips an aborted queued write and starts the next write', async () => {
    const { fs, store } = makeFs();
    const release = deferWrite(fs, store);
    const controller = new AbortController();
    const first = writeVersionedJsonCache(fs, path, state('first'));
    const cancelled = writeVersionedJsonCache(
      fs,
      path,
      state('cancelled'),
      controller.signal,
    );
    const last = writeVersionedJsonCache(fs, path, state('last'));
    controller.abort();
    release();
    await expect(first).resolves.toBe(true);
    await expect(cancelled).resolves.toBe(false);
    await expect(last).resolves.toBe(true);
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    await expect(readVersionedJsonCache(fs, path, isCacheV1)).resolves.toEqual(
      state('last'),
    );
  });

  it('reports serialization errors before giving the adapter any content', async () => {
    const { fs } = makeFs();
    const circular = { self: {} };
    circular.self = circular;
    await expect(writeVersionedJsonCache(fs, path, circular)).resolves.toBe(
      false,
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
