jest.mock('obsidian', () => ({}), { virtual: true });

import { buildZoteroApiEntries } from '../../src/core/adapters/zotero-api-adapter';
import { ZoteroLocalApiClient } from '../../src/core/zotero';
import type { ZoteroApiLibraryData } from '../../src/core/zotero';
import { ZoteroApiSource } from '../../src/sources/zotero-api-source';
import {
  MockZoteroLocalApi,
  mockZoteroCache,
  zoteroItem,
} from '../helpers/zotero-local-api';

function libraryOfSize(size: number): ZoteroApiLibraryData {
  const items: ZoteroApiLibraryData['items'] = [];
  const attachments: ZoteroApiLibraryData['attachments'] = [];
  const annotations: ZoteroApiLibraryData['annotations'] = [];
  for (let i = 0; i < size; i++) {
    const suffix = String(i).padStart(6, '0');
    const item = zoteroItem('IT' + suffix, 1, {
      citationKey: 'paper' + suffix,
      abstractNote:
        'Example abstract for measuring synthetic bibliographic record transfer.',
      collections: ['COLL0001'],
      tags: [{ tag: 'research' }],
    });
    item.csljson = JSON.stringify([
      { type: 'article-journal', title: item.data.title },
    ]);
    items.push(item);
    if (i % 4 === 0) {
      attachments.push(
        zoteroItem('AT' + suffix, 1, {
          itemType: 'attachment',
          parentItem: item.key,
          linkMode: 'imported_file',
          filename: 'paper.pdf',
        }),
      );
    }
    if (i % 8 === 0) {
      annotations.push(
        zoteroItem('AN' + suffix, 1, {
          itemType: 'annotation',
          parentItem: 'AT' + suffix,
          annotationType: 'highlight',
          annotationText: 'Example highlight',
          annotationComment: 'Example note',
          annotationPageLabel: '1',
        }),
      );
    }
  }
  return {
    items,
    attachments,
    annotations,
    collectionNames: { COLL0001: 'Papers' },
    libraryVersion: 1,
  };
}

function withChanges(
  library: ZoteroApiLibraryData,
  count: number,
): ZoteroApiLibraryData {
  if (count === 1) {
    return {
      ...library,
      libraryVersion: 2,
      items: [
        zoteroItem('NEWITEM1', 2, { citationKey: 'newReference' }),
        ...library.items,
      ],
    };
  }
  const edit = <T extends ZoteroApiLibraryData['items'][number]>(
    records: T[],
    edits: number,
    patch: Record<string, unknown>,
  ): T[] =>
    records.map((item, index) =>
      index < edits
        ? { ...item, version: 2, data: { ...item.data, ...patch } }
        : item,
    );
  return {
    ...library,
    libraryVersion: 2,
    items: edit(library.items, count, { title: 'Edited paper' }),
    attachments: edit(library.attachments, Math.ceil(count / 4), {
      filename: 'renamed.pdf',
    }),
    annotations: edit(library.annotations, Math.ceil(count / 8), {
      annotationComment: 'Edited note',
    }),
  };
}

function dtoTime(library: ZoteroApiLibraryData): number {
  const start = performance.now();
  buildZoteroApiEntries(library);
  return performance.now() - start;
}

describe('Zotero Local API synchronization (synthetic transport)', () => {
  it.each([1_000, 10_000, 50_000])(
    'measures full and incremental loads for %i references',
    async (size) => {
      const library = libraryOfSize(size);
      const api = new MockZoteroLocalApi(library);
      const { fs, file } = mockZoteroCache();
      const source = new ZoteroApiSource(
        'bench',
        new ZoteroLocalApiClient(undefined, api.get),
        {},
        fs,
        '/cache/zotero-bench.json',
        undefined,
        true,
      );
      const load = async (
        scenario: string,
        expectedRecords: number,
        expectedChildren: [number, number],
      ) => {
        api.resetMetrics();
        const start = performance.now();
        await source.load();
        const totalMs = performance.now() - start;
        const items = api.fullRecords('items');
        const attachments = api.fullRecords('attachments');
        const annotations = api.fullRecords('annotations');
        expect(items).toBe(expectedRecords);
        expect([attachments, annotations]).toEqual(expectedChildren);
        const dtoMs = scenario === 'unchanged' ? 0 : dtoTime(api.library);
        console.debug(
          JSON.stringify({
            size,
            scenario,
            requests: api.requests.length,
            items,
            attachments,
            annotations,
            responseBytes: api.bytes,
            elapsedMs: Math.round(totalMs),
            retrievalMs: Math.round(api.retrievalMs),
            dtoMs: Math.round(dtoMs),
            v3Bytes: Buffer.byteLength(file.content ?? ''),
          }),
        );
      };

      await load('full', size, [
        library.attachments.length,
        library.annotations.length,
      ]);
      const baseline = file.content;
      const entries = buildZoteroApiEntries(library);
      const v2 = {
        version: 2,
        entries,
        libraryVersion: library.libraryVersion,
        groupId: '',
        collectionKey: '',
        importAnnotations: true,
      };
      console.debug(
        JSON.stringify({
          size,
          v2Bytes: Buffer.byteLength(JSON.stringify(v2)),
        }),
      );
      await load('unchanged', 0, [0, 0]);
      expect(api.requests).toHaveLength(1);

      for (const count of [1, 10, 100]) {
        file.content = baseline;
        api.library = withChanges(library, count);
        const expectedChildren: [number, number] =
          count === 1 ? [0, 0] : [Math.ceil(count / 4), Math.ceil(count / 8)];
        await load('changed ' + count, count, expectedChildren);
      }
    },
    120_000,
  );
});
