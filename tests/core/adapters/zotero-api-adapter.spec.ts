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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
): ZoteroApiLibraryData {
  return {
    items,
    attachments,
    collectionNames: { COLL0001: 'Machine Learning' },
    libraryVersion: 42,
  };
}

// ---------------------------------------------------------------------------
// buildZoteroApiEntries
// ---------------------------------------------------------------------------

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
});

// ---------------------------------------------------------------------------
// ZoteroApiAdapter
// ---------------------------------------------------------------------------

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
});
