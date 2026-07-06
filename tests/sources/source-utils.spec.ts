jest.mock('obsidian', () => ({}), { virtual: true });

import { sourceCacheFilePath } from '../../src/sources/source-utils';

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
});
