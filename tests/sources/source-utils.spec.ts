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
  it('serializes and writes the state', async () => {
    const { fs, store } = makeFs();
    await writeVersionedJsonCache(fs, '/cache.json', {
      version: 1,
      entries: ['a'],
    });
    expect(JSON.parse(store.get('/cache.json')!)).toEqual({
      version: 1,
      entries: ['a'],
    });
  });

  it('is a no-op without a file system or path', async () => {
    const { fs } = makeFs();
    await writeVersionedJsonCache(undefined, '/x', {});
    await writeVersionedJsonCache(fs, undefined, {});
    await writeVersionedJsonCache(fs, '', {});
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('swallows write failures (best-effort cache)', async () => {
    const { fs } = makeFs();
    (fs.writeFile as jest.Mock).mockRejectedValue(new Error('disk full'));
    await expect(
      writeVersionedJsonCache(fs, '/cache.json', { version: 1 }),
    ).resolves.toBeUndefined();
  });
});
