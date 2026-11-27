jest.mock('obsidian', () => ({}), { virtual: true });

import { ZoteroAbortError, ZoteroLocalApiClient } from '../../src/core/zotero';
import { mergeZoteroObjects } from '../../src/core/zotero/zotero-api-delta';
import { ZoteroApiSource } from '../../src/sources/zotero-api-source';
import type { ZoteroApiCacheV3 } from '../../src/sources/zotero-api-cache';
import type { ZoteroApiScope, ZoteroHttpGetFn } from '../../src/core/zotero';
import {
  emptyZoteroLibrary,
  MockZoteroLocalApi,
  mockZoteroCache,
  zoteroItem,
  zoteroResponse,
} from '../helpers/zotero-local-api';

const cachePath = '/cache/zotero-api-test.json';

function setup(
  api: MockZoteroLocalApi,
  {
    scope = {},
    annotations = false,
    baseUrl,
    get = api.get,
  }: {
    scope?: ZoteroApiScope;
    annotations?: boolean;
    baseUrl?: string;
    get?: ZoteroHttpGetFn;
  } = {},
  cache = mockZoteroCache(),
) {
  const client = new ZoteroLocalApiClient(baseUrl, get);
  const source = new ZoteroApiSource(
    'test',
    client,
    scope,
    cache.fs,
    cachePath,
    undefined,
    annotations,
  );
  return {
    ...cache,
    source,
    snapshot: () => JSON.parse(cache.file.content ?? '{}') as ZoteroApiCacheV3,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

function attachment(
  key: string,
  parentItem: string,
  version = 1,
  path = 'attachments:paper.pdf',
) {
  return zoteroItem(key, version, {
    itemType: 'attachment',
    parentItem,
    linkMode: 'linked_file',
    path,
  });
}

function annotation(
  key: string,
  parentItem: string,
  version = 1,
  comment = 'Original',
) {
  return zoteroItem(key, version, {
    itemType: 'annotation',
    parentItem,
    annotationType: 'highlight',
    annotationColor: version === 1 ? '#ffd400' : '#ff6666',
    annotationComment: comment,
    annotationText: 'A quote',
    annotationSortIndex: '00000|000123|00000',
    annotationPageLabel: '1',
  });
}

describe('Zotero object reconciliation', () => {
  it('finds edits and deletions and merges in ordered-key order without mutating the baseline', () => {
    const unchanged = zoteroItem('ITEM0002');
    const cached = [zoteroItem('ITEM0001'), unchanged, zoteroItem('ITEM0003')];
    const updated = [
      zoteroItem('ITEM0001', 2),
      zoteroItem('ITEM0004', 2),
      { ...unchanged },
    ];
    const { items, counts } = mergeZoteroObjects(cached, updated, [
      'ITEM0004',
      'ITEM0002',
      'ITEM0001',
    ]);
    expect(counts).toEqual({ added: 1, modified: 1, removed: 1 });
    expect(items).toEqual([updated[1], unchanged, updated[0]]);
    expect(items[1]).toBe(updated[2]);
    expect(cached.map((item) => item.version)).toEqual([1, 1, 1]);
    expect(() => mergeZoteroObjects(cached, updated, ['ITEM0001'])).toThrow(
      /outside the ordered inventory/,
    );
    expect(() =>
      mergeZoteroObjects(cached, updated, [
        'ITEM0004',
        'ITEM0002',
        'ITEM0001',
        'UNKNOWN1',
      ]),
    ).toThrow(/missing from the cache and delta/);
  });
});

describe('Zotero Local API sync', () => {
  it.each([false, true])(
    'handles restored children older than the cursor (full fetch fails: %s)',
    async (failFull) => {
      const parent = zoteroItem('ITEM0001');
      const child = attachment('ATT00001', parent.key);
      const note = annotation('ANN00001', child.key);
      const api = new MockZoteroLocalApi({
        ...emptyZoteroLibrary(),
        items: [parent],
        attachments: [child],
        annotations: [note],
      });
      const get: ZoteroHttpGetFn = (address, headers) => {
        const url = new URL(address);
        if (
          failFull &&
          api.library.libraryVersion === 3 &&
          url.searchParams.get('format') === 'json' &&
          !url.searchParams.has('since')
        ) {
          return Promise.resolve(zoteroResponse(503, 'Unavailable'));
        }
        return api.get(address, headers);
      };
      const { source, snapshot, file, fs } = setup(api, {
        annotations: true,
        get,
      });
      const writes = jest.spyOn(fs, 'writeFile');
      await source.load();

      // The normal endpoints hide the trashed parent and its descendants.
      api.library = emptyZoteroLibrary(2);
      expect((await source.load()).entries).toEqual([]);
      expect(snapshot().rawLibrary).toMatchObject({
        items: [],
        attachments: [],
        annotations: [],
      });
      const prior = file.content;

      // Restoring visibility can leave the attachment and annotation versions unchanged.
      api.library = {
        ...emptyZoteroLibrary(3),
        items: [{ ...parent, version: 3 }],
        attachments: [child],
        annotations: [note],
      };
      api.resetMetrics();
      const result = await source.load();
      expect(
        api.requests.some(
          ({ list, url, records }) =>
            list === 'attachments' &&
            url.searchParams.get('since') === '2' &&
            records === 0,
        ),
      ).toBe(true);
      if (failFull) {
        expect(result.entries).toEqual([]);
        expect(result.parseErrors?.[0].message).toMatch(/HTTP 503/);
        expect(file.content).toBe(prior);
        expect(writes).toHaveBeenCalledTimes(2);
      } else {
        expect(snapshot().libraryVersion).toBe(3);
        expect(snapshot().entries[0]).toMatchObject({
          key: parent.key,
          attachmentRefs: [{ id: child.key }],
          annotations: [{ id: note.key }],
        });
        expect(result.parseErrors).toEqual([]);
        expect(
          api.requests.some(
            ({ list, format, url }) =>
              list === 'attachments' &&
              format === 'json' &&
              !url.searchParams.has('since'),
          ),
        ).toBe(true);
        expect(writes).toHaveBeenCalledTimes(3);
      }
    },
  );

  it.each([
    ['outside the ordered inventory', 'OTHER001', 2, false],
    ['outside the ordered inventory', 'OTHER001', 2, true],
    ['newer than the pinned library version', 'ITEM0001', 3, false],
    ['newer than the pinned library version', 'ITEM0001', 3, true],
  ])(
    'retries records %s (persistent: fixture %s/%i/%s)',
    async (reason, key, version, persistent) => {
      const api = new MockZoteroLocalApi({
        ...emptyZoteroLibrary(),
        items: [zoteroItem('ITEM0001')],
      });
      let deltaRequests = 0;
      const get: ZoteroHttpGetFn = (address, headers) => {
        const url = new URL(address);
        if (
          url.pathname.endsWith('/items/top') &&
          url.searchParams.has('since')
        ) {
          deltaRequests++;
          if (deltaRequests === 1 || persistent) {
            return Promise.resolve(
              zoteroResponse(200, JSON.stringify([zoteroItem(key, version)]), {
                'Zotero-Server-ID': 'test-server',
                'Last-Modified-Version': '2',
                'Total-Results': '1',
              }),
            );
          }
        }
        return api.get(address, headers);
      };
      const { source, snapshot, file } = setup(api, { get });
      await source.load();
      const prior = file.content;
      api.library = {
        ...emptyZoteroLibrary(2),
        items: [zoteroItem('ITEM0001', 2)],
      };
      const result = await source.load();
      expect(deltaRequests).toBe(2);
      if (persistent) {
        expect(file.content).toBe(prior);
        expect(result.parseErrors?.[0].message).toContain(reason);
      } else {
        expect(snapshot().libraryVersion).toBe(2);
        expect(result.parseErrors).toEqual([]);
      }
    },
  );

  it('logs sync decisions and change counts without logging record content', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001'), zoteroItem('ITEM0002')],
    });
    const { source } = setup(api, { annotations: true });
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const summary = 'ZoteroApiSource: synchronization complete';
    try {
      await source.load();
      expect(debug).toHaveBeenLastCalledWith(summary, {
        mode: 'full',
        cachedVersion: null,
        libraryVersion: 1,
        durationMs: expect.any(Number),
        reason: 'no compatible incremental baseline',
      });
      await source.load();
      expect(debug).toHaveBeenLastCalledWith(summary, {
        mode: 'unchanged',
        cachedVersion: 1,
        libraryVersion: 1,
        durationMs: expect.any(Number),
      });

      const child = attachment('ATT00001', 'ITEM0001', 2);
      api.library = {
        ...emptyZoteroLibrary(2),
        items: [
          zoteroItem('ITEM0001', 2, { title: 'Private title' }),
          zoteroItem('ITEM0003', 2),
        ],
        attachments: [child],
        annotations: [
          annotation('ANN00001', child.key, 2, 'Private annotation'),
        ],
      };
      await source.load();
      expect(debug).toHaveBeenLastCalledWith(summary, {
        mode: 'incremental',
        cachedVersion: 1,
        libraryVersion: 2,
        durationMs: expect.any(Number),
        changes: {
          items: { added: 1, modified: 1, removed: 1 },
          attachments: { added: 1, modified: 0, removed: 0 },
          annotations: { added: 1, modified: 0, removed: 0 },
        },
      });

      await source.load(undefined, { fullRefresh: true });
      expect(debug).toHaveBeenLastCalledWith(summary, {
        mode: 'full',
        cachedVersion: 2,
        libraryVersion: 2,
        durationMs: expect.any(Number),
        reason: 'manual refresh',
      });
      expect(JSON.stringify(debug.mock.calls)).not.toMatch(
        /Private|ITEM0001|ANN00001/,
      );
    } finally {
      debug.mockRestore();
    }
  });

  it('writes a full baseline, probes unchanged data, and only retrieves newly added or edited references', async () => {
    const original = zoteroItem('ITEM0001');
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [original],
    });
    const { source, snapshot, fs } = setup(api);
    const writer = jest.spyOn(fs, 'writeFile');
    await source.load();
    expect(snapshot()).toMatchObject({
      version: 3,
      libraryVersion: 1,
      serverId: api.serverId,
      rawLibrary: { items: [original] },
    });
    expect(api.fullRecords('items')).toBe(1);

    api.resetMetrics();
    await source.load();
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0].url.search).toBe('?limit=1&format=versions');
    expect(api.fullRecords('items')).toBe(0);
    expect(writer).toHaveBeenCalledTimes(1);

    const added = zoteroItem('ITEM0002', 2);
    api.library = {
      ...api.library,
      libraryVersion: 2,
      items: [added, original],
    };
    api.resetMetrics();
    await source.load();
    expect(api.fullRecords('items')).toBe(1);
    expect(
      api.requests
        .find((request) => request.records > 0)
        ?.url.searchParams.get('since'),
    ).toBe('1');
    expect(api.requests.some((request) => request.list === 'annotations')).toBe(
      false,
    );

    const edited = zoteroItem('ITEM0001', 3, { title: 'Edited title' });
    api.library = { ...api.library, libraryVersion: 3, items: [edited, added] };
    api.resetMetrics();
    const result = await source.load();
    expect(result.entries[0].title).toBe('Edited title');
    expect(api.fullRecords('items')).toBe(1);

    api.library = emptyZoteroLibrary(4);
    api.resetMetrics();
    expect((await source.load()).entries).toEqual([]);
    expect(snapshot().rawLibrary?.items).toEqual([]);
    expect(api.fullRecords('items')).toBe(0);
  });

  it.each([{}, { groupId: '42' }])(
    'matches full DTOs after mixed changes with equal timestamps for scope %j',
    async (scope) => {
      const original = {
        ...zoteroItem('ITEM0001', 1, {
          collections: ['COLL0001', 'COLL0002'],
          tags: [{ tag: 'one,two' }],
        }),
        csljson:
          '[{"type":"article-journal","title":"Zotero translator projection"}]',
      };
      const other = zoteroItem('ITEM0002');
      const pinned = zoteroItem('ITEM0003', 1, { citationKey: 'oldPin' });
      const deleted = zoteroItem('ITEM0004');
      const removedAttachment = attachment('ATT00001', original.key);
      const movedAttachment = attachment('ATT00002', original.key);
      const unchangedAttachment = attachment('ATT00003', other.key);
      const editedAnnotation = annotation('ANN00001', movedAttachment.key);
      const deletedAnnotation = annotation('ANN00002', movedAttachment.key);
      const unchangedAnnotation = annotation(
        'ANN00003',
        unchangedAttachment.key,
      );
      const orphan = annotation('ANN00004', 'MISSING1');
      const reparentedAnnotation = annotation(
        'ANN00006',
        removedAttachment.key,
      );

      const api = new MockZoteroLocalApi({
        libraryVersion: 1,
        items: [original, other, pinned, deleted],
        attachments: [removedAttachment, movedAttachment, unchangedAttachment],
        annotations: [
          editedAnnotation,
          deletedAnnotation,
          unchangedAnnotation,
          orphan,
          reparentedAnnotation,
        ],
        collectionNames: {
          COLL0001: 'Before rename',
          COLL0002: 'Deleted collection',
        },
      });
      const { source, snapshot } = setup(api, { scope, annotations: true });
      await source.load();
      expect(snapshot().rawLibrary?.annotations).toContainEqual(orphan);
      expect(snapshot().rawLibrary?.items[0].csljson).toBe(original.csljson);

      const newPinned = zoteroItem('ITEM0005', 2, {
        extra: 'Citation Key: smith2024',
      });
      const moved = attachment(
        movedAttachment.key,
        other.key,
        2,
        '/linked/renamed.pdf',
      );
      const added = attachment('ATT00004', original.key, 2);
      api.library = {
        libraryVersion: 2,
        items: [
          newPinned,
          other,
          original,
          zoteroItem(pinned.key, 2, {
            citationKey: 'newPin',
            collections: ['COLL0001'],
          }),
        ],
        attachments: [moved, added, unchangedAttachment],
        annotations: [
          unchangedAnnotation,
          annotation(editedAnnotation.key, moved.key, 2, 'Edited comment'),
          orphan,
          annotation('ANN00005', added.key, 2),
          annotation(reparentedAnnotation.key, added.key, 2),
        ],
        collectionNames: { COLL0001: 'Renamed collection' },
      };
      api.resetMetrics();
      await source.load();

      const incremental = snapshot();
      expect(incremental.entries.map((entry) => entry.citekey)).toEqual([
        'smith2024',
        'smith2024a',
        'smith2024b',
        'newPin',
      ]);
      expect(incremental.entries[2]).toMatchObject({
        collections: ['Renamed collection'],
        tags: ['one,two'],
        attachmentRefs: [{ id: added.key }],
      });
      expect(
        incremental.entries[1].attachmentRefs?.map((ref) => ref.path),
      ).toEqual(['/linked/renamed.pdf', 'paper.pdf']);
      expect(
        incremental.entries[1].annotations?.map((note) => note.comment),
      ).toContain('Edited comment');
      expect(
        incremental.entries[1].annotations?.map((note) => note.id),
      ).not.toContain(deletedAnnotation.key);
      expect(
        incremental.entries[2].annotations?.map((note) => note.id),
      ).toContain(reparentedAnnotation.key);
      expect(incremental.entries[3].collections).toEqual([
        'Renamed collection',
      ]);
      expect(api.fullRecords('items')).toBe(2);
      expect(api.fullRecords('attachments')).toBe(2);
      expect(api.fullRecords('annotations')).toBe(3);

      const full = setup(api, { scope, annotations: true });
      await full.source.load(undefined, { fullRefresh: true });
      expect(incremental.entries).toEqual(full.snapshot().entries);
      expect(incremental.rawLibrary).toEqual(full.snapshot().rawLibrary);
      expect(
        api.requests
          .filter(
            (request) =>
              request.list !== 'collections' &&
              request.url.searchParams.get('limit') !== '1',
          )
          .every(
            ({ url }) =>
              url.searchParams.get('sort') === 'dateModified' &&
              url.searchParams.get('direction') === 'desc',
          ),
      ).toBe(true);
    },
  );

  it('updates collection metadata with no change to cached item versions', async () => {
    const item = zoteroItem('ITEM0001', 1, { collections: ['COLL0001'] });
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [item],
      collectionNames: { COLL0001: 'Old name' },
    });
    const { source, snapshot } = setup(api);
    await source.load();
    api.library = {
      ...api.library,
      libraryVersion: 2,
      collectionNames: { COLL0001: 'New name' },
    };
    api.resetMetrics();
    await source.load();
    expect(snapshot().entries[0].collections).toEqual(['New name']);
    expect(api.fullRecords('items')).toBe(0);
    expect(api.fullRecords('collections')).toBe(1);
  });

  it('uses full fetches on legacy servers even if the version stays equal', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    api.serverId = null;
    const { source, snapshot } = setup(api);
    await source.load();
    api.library.items = [zoteroItem('ITEM0002')];
    api.resetMetrics();
    await source.load();
    expect(snapshot().entries[0].key).toBe('ITEM0002');
    expect(snapshot().rawLibrary).toBeUndefined();
    expect(api.fullRecords('items')).toBe(1);
  });

  it('falls back to DTO-only full fetches when a known server omits its version', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      libraryVersion: null,
      items: [zoteroItem('ITEM0001')],
    });
    const { source, snapshot } = setup(api);
    await source.load();
    await source.load();
    expect(snapshot()).toMatchObject({
      serverId: api.serverId,
      libraryVersion: null,
    });
    expect(snapshot().rawLibrary).toBeUndefined();
    expect(api.fullRecords('items')).toBe(2);
  });

  it('fully fetches collection-scoped and forced refreshes', async () => {
    const member = zoteroItem('ITEM0001', 1, { collections: ['COLL0001'] });
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [member, zoteroItem('ITEM0002')],
    });
    const scoped = setup(api, { scope: { collectionKey: 'COLL0001' } });
    await scoped.source.load();
    await scoped.source.load();
    expect(scoped.snapshot().entries.map((entry) => entry.key)).toEqual([
      member.key,
    ]);
    expect(scoped.snapshot().rawLibrary).toBeUndefined();
    expect(api.fullRecords('items')).toBe(2);

    const full = setup(api);
    await full.source.load();
    api.resetMetrics();
    await full.source.load(undefined, { fullRefresh: true });
    expect(api.fullRecords('items')).toBe(2);
  });

  it('migrates V2 only after a successful full fetch and limits offline use to the default URL', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const baseline = setup(api);
    await baseline.source.load();
    const { entries } = baseline.snapshot();
    const oldCache = JSON.stringify({
      version: 2,
      libraryVersion: -1,
      groupId: '',
      collectionKey: '',
      importAnnotations: false,
      entries,
    });

    const cache = mockZoteroCache(oldCache);
    api.offline = true;
    const offline = await setup(api, {}, cache).source.load();
    expect(offline.entries).toHaveLength(1);
    expect(offline.parseErrors?.[0].message).toMatch(/using cache/);
    await expect(
      setup(api, { baseUrl: 'http://localhost:23120' }, cache).source.load(),
    ).rejects.toThrow(/Zotero is closed/);
    expect(cache.file.content).toBe(oldCache);
    api.offline = false;
    api.resetMetrics();

    const upgraded = setup(api, {}, cache);
    await upgraded.source.load();
    expect(upgraded.snapshot().version).toBe(3);
    expect(api.fullRecords('items')).toBe(1);
  });

  it.each([
    { scope: { groupId: '42' } },
    { baseUrl: 'http://localhost:23120' },
    { annotations: true },
  ])(
    'invalidates snapshots from a different configuration %j',
    async (config) => {
      const api = new MockZoteroLocalApi({
        ...emptyZoteroLibrary(),
        items: [zoteroItem('ITEM0001')],
      });
      const baseline = setup(api);
      await baseline.source.load();
      api.offline = true;
      const changed = setup(api, config, baseline);
      await expect(changed.source.load()).rejects.toThrow(/Zotero is closed/);
      expect(baseline.snapshot().entries).toHaveLength(1);
      api.offline = false;
      api.resetMetrics();
      await changed.source.load();
      expect(api.fullRecords('items')).toBe(1);
    },
  );

  it('ignores corrupt V3 baselines and rebuilds them when online', async () => {
    const item = zoteroItem('ITEM0001');
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [item],
    });
    const { source, snapshot, file } = setup(api);
    await source.load();
    const corrupt = snapshot();
    corrupt.rawLibrary?.items.push(item);
    file.content = JSON.stringify(corrupt);
    api.offline = true;
    await expect(source.load()).rejects.toThrow(/Zotero is closed/);
    api.offline = false;
    api.resetMetrics();
    await source.load();
    expect(api.fullRecords('items')).toBe(1);
  });

  it('forces a fresh full sync when library version rolls back', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(5),
      items: [zoteroItem('ITEM0001')],
    });
    const { source, snapshot } = setup(api);
    await source.load();
    api.library = { ...emptyZoteroLibrary(2), items: [zoteroItem('ITEM0002')] };
    api.resetMetrics();
    await source.load();
    expect(snapshot().libraryVersion).toBe(2);
    expect(snapshot().entries[0].key).toBe('ITEM0002');
    expect(api.fullRecords('items')).toBe(1);
  });

  it('reprobes after a 412 and establishes a full baseline against the new server', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const get: ZoteroHttpGetFn = (url, headers) => {
      if (url.includes('format=keys')) api.serverId = 'new-server';
      return api.get(url, headers);
    };
    const { source, snapshot } = setup(api, { get });
    await source.load();
    api.library = {
      ...emptyZoteroLibrary(2),
      items: [zoteroItem('ITEM0002', 2)],
    };
    api.resetMetrics();
    await source.load();
    expect(snapshot()).toMatchObject({
      serverId: 'new-server',
      libraryVersion: 2,
    });
    const records = api.requests.filter((request) => request.records > 0);
    expect(records).toHaveLength(1);
    expect(records[0].url.searchParams.has('since')).toBe(false);
  });

  it('retries with a full fetch when the final probe observes a different server at the same version', async () => {
    const original = zoteroItem('ITEM0001');
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [original],
    });
    const cache = setup(api);
    await cache.source.load();
    api.library = {
      ...api.library,
      libraryVersion: 2,
      items: [zoteroItem('ITEM0002', 2), original],
    };
    let probes = 0;
    const get: ZoteroHttpGetFn = (url, headers) => {
      if (url.includes('limit=1&format=versions') && ++probes === 2) {
        api.serverId = 'other-server';
        api.library = {
          ...emptyZoteroLibrary(2),
          items: [zoteroItem('ITEM0003', 2)],
        };
      }
      return api.get(url, headers);
    };
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      await setup(api, { get }, cache).source.load();
      expect(debug).toHaveBeenLastCalledWith(
        'ZoteroApiSource: synchronization complete',
        expect.objectContaining({
          mode: 'full',
          reason: 'server identity changed during synchronization',
        }),
      );
    } finally {
      debug.mockRestore();
    }
    expect(probes).toBe(4);
    expect(cache.snapshot()).toMatchObject({
      serverId: 'other-server',
      libraryVersion: 2,
      entries: [{ key: 'ITEM0003' }],
    });
  });

  it('rejects a known foreign cache even on a later offline load', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const cache = setup(api);
    await cache.source.load();
    const before = cache.file.content;
    api.serverId = 'other-server';
    const failingGet: ZoteroHttpGetFn = (url, headers) =>
      url.includes('format=json')
        ? Promise.resolve(zoteroResponse(503, 'Unavailable'))
        : api.get(url, headers);

    const observingSource = setup(api, { get: failingGet }, cache).source;
    await expect(observingSource.load()).rejects.toThrow(/HTTP 503/);
    api.offline = true;
    await expect(observingSource.load()).rejects.toThrow(/Zotero is closed/);
    expect(cache.file.content).toBe(before);
    // A replacement source can only rule out the cache once it observes a
    // different server itself.
    observingSource.dispose();
    expect((await setup(api, {}, cache).source.load()).entries).toHaveLength(1);
  });

  it('does not overwrite the prior cache after a partial synchronization failure', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const cache = setup(api);
    await cache.source.load();
    const before = cache.file.content;
    api.library = {
      ...emptyZoteroLibrary(2),
      items: [zoteroItem('ITEM0002', 2)],
    };
    const failingGet: ZoteroHttpGetFn = (url, headers) =>
      url.includes('/collections?')
        ? Promise.resolve(zoteroResponse(503, 'Unavailable'))
        : api.get(url, headers);
    const result = await setup(api, { get: failingGet }, cache).source.load();
    expect(result.entries[0].title).toBe('Article ITEM0001');
    expect(result.parseErrors?.[0].message).toMatch(/HTTP 503/);
    expect(cache.file.content).toBe(before);
  });

  it('retries a full baseline when the final probe sees a write during sync', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    let probes = 0;
    const get: ZoteroHttpGetFn = (url, headers) => {
      if (url.includes('limit=1&format=versions') && ++probes === 2) {
        api.library = {
          ...emptyZoteroLibrary(2),
          items: [zoteroItem('ITEM0002', 2)],
        };
      }
      return api.get(url, headers);
    };
    const { source, snapshot } = setup(api, { get });
    await source.load();
    expect(probes).toBe(4);
    expect(snapshot().libraryVersion).toBe(2);
    expect(snapshot().entries[0].key).toBe('ITEM0002');
  });

  it('fails after one retry if the library keeps changing and has no baseline', async () => {
    const api = new MockZoteroLocalApi(emptyZoteroLibrary());
    let probes = 0;
    const get: ZoteroHttpGetFn = (url, headers) => {
      if (url.includes('limit=1&format=versions')) probes++;
      else api.library.libraryVersion = (api.library.libraryVersion ?? 0) + 1;
      return api.get(url, headers);
    };
    const { source, file } = setup(api, { get });
    await expect(source.load()).rejects.toThrow(/library changed/);
    expect(probes).toBe(2);
    expect(file.content).toBeUndefined();
  });

  it('retries an incremental sync when an intermediate list version advances', async () => {
    const original = zoteroItem('ITEM0001');
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [original],
    });
    const cache = setup(api);
    await cache.source.load();
    api.library = {
      ...emptyZoteroLibrary(2),
      items: [zoteroItem('ITEM0002', 2), original],
    };
    api.resetMetrics();
    let changed = false;
    const get: ZoteroHttpGetFn = (url, headers) => {
      if (!changed && url.includes('itemType=attachment&format=keys')) {
        changed = true;
        api.library = {
          ...emptyZoteroLibrary(3),
          items: [
            zoteroItem('ITEM0002', 3, { title: 'Final revision' }),
            original,
          ],
        };
      }
      return api.get(url, headers);
    };
    await setup(api, { get }, cache).source.load();
    expect(cache.snapshot().libraryVersion).toBe(3);
    expect(cache.snapshot().entries[0].csl.title).toBe('Final revision');
    expect(api.fullRecords('items')).toBe(2);
    expect(
      api.requests
        .filter((request) => request.list === 'items' && request.records > 0)
        .every(({ url }) => url.searchParams.get('since') === '1'),
    ).toBe(true);
  });

  it('prevents a superseded HTTP load from committing even if its transport completes later', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const started = deferred();
    const release = deferred();
    const get: ZoteroHttpGetFn = async (url, headers) => {
      const response = await api.get(url, headers);
      started.resolve();
      await release.promise;
      return response;
    };
    const older = setup(api, { get });
    const pending = expect(older.source.load()).rejects.toThrow(
      ZoteroAbortError,
    );
    await started.promise;
    older.source.dispose();
    api.library = {
      ...emptyZoteroLibrary(2),
      items: [zoteroItem('ITEM0002', 2)],
    };
    await setup(api, {}, older).source.load();
    release.resolve();
    await pending;
    expect(older.snapshot().libraryVersion).toBe(2);
  });

  it('orders an in-progress cache write before a replacement source can commit', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const cache = setup(api);
    const started = deferred();
    const release = deferred();
    const write = cache.fs.writeFile;
    const writer = jest
      .spyOn(cache.fs, 'writeFile')
      .mockImplementationOnce(async (path, data) => {
        started.resolve();
        await release.promise;
        await write(path, data);
      });
    const first = expect(cache.source.load()).rejects.toThrow(ZoteroAbortError);
    await started.promise;

    cache.source.dispose();
    api.library = {
      ...emptyZoteroLibrary(2),
      items: [zoteroItem('ITEM0002', 2)],
    };
    const second = setup(api, {}, cache).source.load();
    expect(writer).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, second]);
    expect(writer).toHaveBeenCalledTimes(2);
    expect(cache.snapshot().libraryVersion).toBe(2);
  });

  it('returns the validated online result if persisting the snapshot fails', async () => {
    const api = new MockZoteroLocalApi({
      ...emptyZoteroLibrary(),
      items: [zoteroItem('ITEM0001')],
    });
    const cache = setup(api);
    await cache.source.load();
    api.library = {
      ...emptyZoteroLibrary(2),
      items: [zoteroItem('ITEM0002', 2)],
    };
    jest
      .spyOn(cache.fs, 'writeFile')
      .mockRejectedValueOnce(new Error('Disk write failed'));
    const result = await cache.source.load();
    expect(result.entries[0].title).toBe('Article ITEM0002');
    expect(result.parseErrors).toEqual([]);
    expect(cache.snapshot().libraryVersion).toBe(1);
    await cache.source.load();
    expect(cache.snapshot().libraryVersion).toBe(2);
  });
});
