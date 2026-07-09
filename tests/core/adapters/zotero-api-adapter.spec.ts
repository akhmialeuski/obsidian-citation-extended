jest.mock('obsidian', () => ({}), { virtual: true });

import {
  buildZoteroApiEntries,
  ZoteroApiAdapter,
} from '../../../src/core/adapters/zotero-api-adapter';
import type { ZoteroApiEntryData } from '../../../src/core/adapters/zotero-api-adapter';
import { convertToEntries } from '../../../src/core/adapters/entry-adapter-factory';
import { DATABASE_FORMATS } from '../../../src/core/types/database';
import type {
  ZoteroApiItem,
  ZoteroApiLibraryData,
} from '../../../src/core/zotero/zotero-local-api-client';

function makeItem(overrides: Partial<ZoteroApiItem> = {}): ZoteroApiItem {
  return {
    key: 'ITEM0001',
    version: 5,
    data: {
      itemType: 'journalArticle',
      title: 'Deep Learning',
      citationKey: 'lecun2015',
      creators: [
        { creatorType: 'author', firstName: 'Yann', lastName: 'LeCun' },
        { creatorType: 'author', firstName: 'Yoshua', lastName: 'Bengio' },
      ],
      date: '2015-05-28',
      DOI: '10.1038/nature14539',
      publicationTitle: 'Nature',
      volume: '521',
      pages: '436-444',
      tags: [{ tag: 'deep-learning' }, { tag: 'neural-networks' }],
      collections: ['COLL0001'],
      dateAdded: '2026-01-01T00:00:00Z',
      dateModified: '2026-02-01T00:00:00Z',
    },
    meta: { parsedDate: '2015-05-28' },
    ...overrides,
  };
}

function makeLibrary(
  items: ZoteroApiItem[],
  attachments: ZoteroApiItem[] = [],
  annotations: ZoteroApiItem[] = [],
): ZoteroApiLibraryData {
  return {
    items,
    attachments,
    annotations,
    collectionNames: { COLL0001: 'Machine Learning' },
    libraryVersion: 42,
  };
}

describe('buildZoteroApiEntries', () => {
  it('builds a DTO with the native citation key', () => {
    const entries = buildZoteroApiEntries(makeLibrary([makeItem()]));

    expect(entries).toHaveLength(1);
    const dto = entries[0];
    expect(dto.citekey).toBe('lecun2015');
    expect(dto.key).toBe('ITEM0001');
    expect(dto.csl.id).toBe('lecun2015');
    expect(dto.csl['zotero-key']).toBe('ITEM0001');
    expect(dto.csl.type).toBe('article-journal');
    expect(dto.csl.title).toBe('Deep Learning');
    expect(dto.csl.DOI).toBe('10.1038/nature14539');
    expect(dto.csl['container-title']).toBe('Nature');
    expect(dto.csl.page).toBe('436-444');
    expect(dto.csl.issued).toEqual({ 'date-parts': [[2015, 5, 28]] });
    expect(dto.csl.keyword).toBe('deep-learning, neural-networks');
    expect(dto.collections).toEqual(['Machine Learning']);
  });

  it('falls back to the Extra "Citation Key:" line', () => {
    const item = makeItem();
    delete item.data.citationKey;
    item.data.extra = 'OCLC: 1234\nCitation Key: pinned2020\nPMID: 99';

    const [dto] = buildZoteroApiEntries(makeLibrary([item]));

    expect(dto.citekey).toBe('pinned2020');
  });

  it('generates lastnameYear when no key is pinned anywhere', () => {
    const item = makeItem();
    delete item.data.citationKey;

    const [dto] = buildZoteroApiEntries(makeLibrary([item]));

    expect(dto.citekey).toBe('lecun2015');
  });

  it('generates a citekey from a single-field (literal) creator', () => {
    const item = makeItem({
      data: {
        itemType: 'report',
        title: 'Annual Report',
        creators: [{ creatorType: 'author', name: 'European Union' }],
        date: '2024',
      },
      meta: {},
    });

    const [dto] = buildZoteroApiEntries(makeLibrary([item]));

    expect(dto.citekey).toBe('europeanunion2024');
  });

  it('deduplicates generated citekeys with letter suffixes', () => {
    const a = makeItem({ key: 'ITEMAAA1' });
    const b = makeItem({ key: 'ITEMBBB2' });
    delete a.data.citationKey;
    delete b.data.citationKey;

    const entries = buildZoteroApiEntries(makeLibrary([a, b]));

    expect(entries.map((e) => e.citekey)).toEqual(['lecun2015', 'lecun2015a']);
  });

  it('prefers the csljson projection when the API provides one', () => {
    const item = makeItem({
      csljson: {
        id: '12345/ITEM0001',
        type: 'article-journal',
        title: 'Projected Title',
        author: [{ family: 'LeCun', given: 'Yann' }],
        issued: { 'date-parts': [[2015]] },
      },
    });

    const [dto] = buildZoteroApiEntries(makeLibrary([item]));

    expect(dto.csl.title).toBe('Projected Title');
    // The projection id (a Zotero URI) is replaced by the citekey.
    expect(dto.csl.id).toBe('lecun2015');
    expect(dto.csl['zotero-key']).toBe('ITEM0001');
  });

  it('synthesizes storage paths for stored attachments', () => {
    const attachment: ZoteroApiItem = {
      key: 'ATT00001',
      version: 3,
      data: {
        itemType: 'attachment',
        parentItem: 'ITEM0001',
        linkMode: 'imported_file',
        contentType: 'application/pdf',
        filename: 'lecun2015.pdf',
      },
    };

    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment]),
    );

    expect(dto.files).toEqual(['storage/ATT00001/lecun2015.pdf']);
  });

  it('keeps linked-file paths and skips linked URLs', () => {
    const linkedFile: ZoteroApiItem = {
      key: 'ATT00002',
      version: 3,
      data: {
        itemType: 'attachment',
        parentItem: 'ITEM0001',
        linkMode: 'linked_file',
        path: 'attachments:papers/lecun2015.pdf',
      },
    };
    const linkedUrl: ZoteroApiItem = {
      key: 'ATT00003',
      version: 3,
      data: {
        itemType: 'attachment',
        parentItem: 'ITEM0001',
        linkMode: 'linked_url',
        url: 'https://example.com',
      },
    };

    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [linkedFile, linkedUrl]),
    );

    expect(dto.files).toEqual(['papers/lecun2015.pdf']);
  });

  it('skips items with malformed data', () => {
    const broken = { key: 'BROKEN01', version: 1 } as unknown as ZoteroApiItem;
    const entries = buildZoteroApiEntries(makeLibrary([broken, makeItem()]));
    expect(entries).toHaveLength(1);
  });

  it('excludes standalone notes and attachments returned under /items/top', () => {
    // /items/top includes top-level standalone notes and attachments; they are
    // not bibliographic entries and would otherwise become titleless junk
    // records with generated `item`/`itema` citekeys.
    const note = {
      key: 'NOTE0001',
      version: 1,
      data: { itemType: 'note', note: '<p>a standalone note</p>' },
    } as unknown as ZoteroApiItem;
    const attachment = {
      key: 'ATTA0001',
      version: 1,
      data: { itemType: 'attachment', filename: 'orphan.pdf' },
    } as unknown as ZoteroApiItem;

    const entries = buildZoteroApiEntries(
      makeLibrary([note, attachment, makeItem()]),
    );

    expect(entries.map((e) => e.key)).toEqual(['ITEM0001']);
  });

  it('a pinned citekey wins over an earlier generated collision', () => {
    // Item A comes FIRST in API order and would generate "lecun2015"; item B
    // has that exact key user-pinned. B must keep its pinned key (existing
    // notes/links point at it) — A gets the suffix.
    const generated = makeItem({ key: 'ITEMAAA1' });
    delete generated.data.citationKey;
    const pinned = makeItem({ key: 'ITEMBBB2' });

    const entries = buildZoteroApiEntries(makeLibrary([generated, pinned]));

    expect(entries.map((e) => [e.key, e.citekey])).toEqual([
      ['ITEMAAA1', 'lecun2015a'],
      ['ITEMBBB2', 'lecun2015'],
    ]);
  });
});

describe('buildZoteroApiEntries — annotations', () => {
  const attachment: ZoteroApiItem = {
    key: 'ATT00001',
    version: 3,
    data: {
      itemType: 'attachment',
      parentItem: 'ITEM0001',
      linkMode: 'imported_file',
      contentType: 'application/pdf',
      filename: 'lecun2015.pdf',
    },
  };

  function makeAnnotation(
    overrides: Partial<Record<string, unknown>> = {},
    key = 'ANN00001',
  ): ZoteroApiItem {
    return {
      key,
      version: 7,
      data: {
        itemType: 'annotation',
        parentItem: 'ATT00001',
        annotationType: 'highlight',
        annotationText: 'the quick brown fox',
        annotationComment: 'important',
        annotationColor: '#ffd400',
        annotationPageLabel: '5',
        annotationSortIndex: '00004|001234|00567',
        // The local API keeps the position as the raw JSON string.
        annotationPosition: '{"pageIndex":4,"rects":[[1,2,3,4]]}',
        tags: [{ tag: 'method' }],
        dateModified: '2026-03-01T00:00:00Z',
        ...overrides,
      },
    };
  }

  it('maps annotation items onto the parent entry via the attachment chain', () => {
    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment], [makeAnnotation()]),
    );

    expect(dto.annotations).toHaveLength(1);
    const annotation = dto.annotations![0];
    expect(annotation).toEqual({
      id: 'ANN00001',
      type: 'highlight',
      text: 'the quick brown fox',
      comment: 'important',
      color: '#ffd400',
      colorName: 'yellow',
      page: 5, // pageIndex 4 from the JSON-string position, 1-based
      pageLabel: '5',
      tags: ['method'],
      imagePath: null,
      openURI:
        'zotero://open-pdf/library/items/ATT00001?page=5&annotation=ANN00001',
      sortIndex: '00004|001234|00567',
      dateModified: '2026-03-01T00:00:00Z',
      source: 'zotero',
    });
  });

  it('builds attachment refs with annotation counts', () => {
    const [dto] = buildZoteroApiEntries(
      makeLibrary(
        [makeItem()],
        [attachment],
        [makeAnnotation(), makeAnnotation({}, 'ANN00002')],
      ),
    );

    expect(dto.attachmentRefs).toEqual([
      {
        id: 'ATT00001',
        path: 'storage/ATT00001/lecun2015.pdf',
        title: 'lecun2015',
        openURI: 'zotero://open-pdf/library/items/ATT00001',
        annotationCount: 2,
      },
    ]);
  });

  it('orders annotations by sortIndex (reading order), not API order', () => {
    const later = makeAnnotation(
      { annotationSortIndex: '00009|000001|00001', annotationText: 'later' },
      'ANN00009',
    );
    const earlier = makeAnnotation(
      { annotationSortIndex: '00001|000001|00001', annotationText: 'earlier' },
      'ANN00002',
    );

    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment], [later, earlier]),
    );

    expect(dto.annotations!.map((a) => a.text)).toEqual(['earlier', 'later']);
  });

  it('uses the group-library open URI when the scope has a groupId', () => {
    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment], [makeAnnotation()]),
      { groupId: '4478' },
    );

    expect(dto.annotations![0].openURI).toBe(
      'zotero://open-pdf/groups/4478/items/ATT00001?page=5&annotation=ANN00001',
    );
    expect(dto.attachmentRefs![0].openURI).toBe(
      'zotero://open-pdf/groups/4478/items/ATT00001',
    );
  });

  it('drops annotations whose parent attachment belongs to no entry', () => {
    const orphan = makeAnnotation({ parentItem: 'ATTOTHER' }, 'ANN00003');

    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment], [orphan]),
    );

    expect(dto.annotations).toBeUndefined();
    expect(dto.attachmentRefs![0].annotationCount).toBe(0);
  });

  it('excludes bare web-link attachments from refs entirely', () => {
    const linkedUrl: ZoteroApiItem = {
      key: 'ATT00003',
      version: 3,
      data: {
        itemType: 'attachment',
        parentItem: 'ITEM0001',
        linkMode: 'linked_url',
        url: 'https://example.com',
      },
    };

    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment, linkedUrl], []),
    );

    expect(dto.attachmentRefs!.map((r) => r.id)).toEqual(['ATT00001']);
  });
});

describe('ZoteroApiAdapter', () => {
  function makeDto(): ZoteroApiEntryData {
    return buildZoteroApiEntries(
      makeLibrary(
        [makeItem()],
        [
          {
            key: 'ATT00001',
            version: 1,
            data: {
              itemType: 'attachment',
              parentItem: 'ITEM0001',
              linkMode: 'imported_file',
              filename: 'lecun2015.pdf',
            },
          },
        ],
      ),
    )[0];
  }

  it('exposes CSL fields through the standard Entry surface', () => {
    const entry = new ZoteroApiAdapter(makeDto());

    expect(entry.id).toBe('lecun2015');
    expect(entry.citekey).toBe('lecun2015');
    expect(entry.title).toBe('Deep Learning');
    expect(entry.authorString).toBe('Yann LeCun, Yoshua Bengio');
    expect(entry.year).toBe(2015);
    expect(entry.DOI).toBe('10.1038/nature14539');
    expect(entry.containerTitle).toBe('Nature');
    expect(entry.zoteroId).toBe('ITEM0001');
    expect(entry.keywords).toEqual(['deep-learning', 'neural-networks']);
    expect(entry.collections).toEqual(['Machine Learning']);
    expect(entry.files).toEqual(['storage/ATT00001/lecun2015.pdf']);
  });

  it('exposes Zotero identifiers via entry.zotero', () => {
    const entry = new ZoteroApiAdapter(makeDto());

    expect(entry.zotero).toEqual({
      key: 'ITEM0001',
      version: 5,
      dateAdded: '2026-01-01T00:00:00Z',
      dateModified: '2026-02-01T00:00:00Z',
    });
    // toTemplateContext carries it through entry.*
    const context = entry.toTemplateContext();
    expect((context.entry as { zotero: { key: string } }).zotero.key).toBe(
      'ITEM0001',
    );
  });

  it('is registered with the entry adapter factory', () => {
    const entries = convertToEntries(DATABASE_FORMATS.ZoteroApi, [
      makeDto(),
    ] as never);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toBeInstanceOf(ZoteroApiAdapter);
    expect(entries[0].citekey).toBe('lecun2015');
  });

  it('builds the native select URI from the item key (no BBT handler)', () => {
    expect(new ZoteroApiAdapter(makeDto()).zoteroSelectURI).toBe(
      'zotero://select/library/items/ITEM0001',
    );
  });

  it('builds the group select URI when fetched from a group scope', () => {
    const dto = { ...makeDto(), groupId: '4478' };
    expect(new ZoteroApiAdapter(dto).zoteroSelectURI).toBe(
      'zotero://select/groups/4478/items/ITEM0001',
    );
  });

  it('exposes the open-pdf library prefix for the PDF-link template helpers', () => {
    // Personal library → 'library'; group library → 'groups/<id>', so the
    // template helpers build open-pdf links that point at the right library.
    expect(new ZoteroApiAdapter(makeDto()).zoteroLibraryPrefix).toBe('library');
    expect(
      new ZoteroApiAdapter({ ...makeDto(), groupId: '4478' })
        .zoteroLibraryPrefix,
    ).toBe('groups/4478');
    // …and it is carried through the template context.
    const context = new ZoteroApiAdapter({
      ...makeDto(),
      groupId: '4478',
    }).toTemplateContext();
    expect(context.zoteroLibraryPrefix).toBe('groups/4478');
  });

  it('keeps a comma inside a native tag as one keyword', () => {
    const item = makeItem();
    item.data.tags = [{ tag: 'reading, methodology' }, { tag: 'ml' }];

    const [dto] = buildZoteroApiEntries(makeLibrary([item]));
    const entry = new ZoteroApiAdapter(dto);

    // The CSL keyword string would re-split on the comma; the native tags
    // must win.
    expect(entry.keywords).toEqual(['reading, methodology', 'ml']);
  });

  it('exposes injected annotations through the uniform Entry interface', () => {
    const attachment: ZoteroApiItem = {
      key: 'ATT00001',
      version: 1,
      data: {
        itemType: 'attachment',
        parentItem: 'ITEM0001',
        linkMode: 'imported_file',
        filename: 'lecun2015.pdf',
      },
    };
    const annotation: ZoteroApiItem = {
      key: 'ANN00001',
      version: 1,
      data: {
        itemType: 'annotation',
        parentItem: 'ATT00001',
        annotationType: 'highlight',
        annotationText: 'quoted',
        annotationColor: '#5fb236',
        annotationSortIndex: '00001|000001|00001',
      },
    };

    const [dto] = buildZoteroApiEntries(
      makeLibrary([makeItem()], [attachment], [annotation]),
    );
    const entry = new ZoteroApiAdapter(dto);

    expect(entry.annotations).toHaveLength(1);
    expect(entry.annotations[0].text).toBe('quoted');
    expect(entry.annotations[0].colorName).toBe('green');
    expect(entry.attachments).toHaveLength(1);
    expect(entry.attachments[0].annotationCount).toBe(1);
    // The DTO round-trips through the on-disk cache as plain JSON — a cached
    // entry must surface the same annotations.
    const revived = new ZoteroApiAdapter(
      JSON.parse(JSON.stringify(dto)) as ZoteroApiEntryData,
    );
    expect(revived.annotations).toHaveLength(1);
  });
});
