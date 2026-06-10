import {
  buildSearchIndexJson,
  createMiniSearchOptions,
  createSearchIndex,
  loadSearchIndexJson,
  normalizeTerm,
} from '../../src/search/search-index';
import { SearchService } from '../../src/search/search.service';
import { WORKER_TASK_KINDS } from '../../src/core';
import type { SearchDocument, WorkerRequest } from '../../src/core';
import type { WorkerManager } from '../../src/util';
import { Entry } from '../../src/core';

class MockEntry extends Entry {
  id!: string;
  type = 'article-journal';
  title?: string;
  authorString?: string;
  abstract = '';
  author = [];
  containerTitle = '';
  DOI = '';
  ISBN?: string;
  issuedDate = null;
  page = '';
  titleShort = '';
  URL = '';
  zoteroId?: string;
  keywords?: string[];
  eventPlace = '';
  language = '';
  source = '';
  publisher = '';
  publisherPlace = '';
  series = '';
  volume = '';
  files = null;
  eprint = null;
  eprinttype = null;
  _sourceDatabase?: string;
  _compositeCitekey?: string;

  get citekey(): string {
    return this.id;
  }

  constructor(data: Partial<Entry>) {
    super();
    Object.assign(this, data);
  }
}

function makeDocs(): SearchDocument[] {
  return [
    {
      id: 'a1',
      title: 'Quantum Mechanics',
      authorString: 'Müller, Hans',
      year: '2020',
      zoteroId: '',
      notesText: '',
    },
    {
      id: 'b2',
      title: 'Classical Physics',
      authorString: 'Smith, Jane',
      year: '2019',
      zoteroId: '',
      notesText: 'a note about serendipity',
    },
  ];
}

describe('search-index module', () => {
  it('builds an index JSON and deserializes it with identical options', async () => {
    const json = buildSearchIndexJson(makeDocs());
    expect(typeof json).toBe('string');

    const index = await loadSearchIndexJson(json);
    const results = index.search('quantum');
    expect(results.map((r) => r.id as string)).toContain('a1');
  });

  it('round-tripped index preserves diacritics normalization', async () => {
    const index = await loadSearchIndexJson(buildSearchIndexJson(makeDocs()));
    // "Muller" must match the indexed "Müller" via NFD processTerm.
    expect(index.search('muller').map((r) => r.id as string)).toContain('a1');
  });

  it('round-tripped index finds note-only matches', async () => {
    const index = await loadSearchIndexJson(buildSearchIndexJson(makeDocs()));
    expect(index.search('serendipity').map((r) => r.id as string)).toContain(
      'b2',
    );
  });

  it('createSearchIndex returns an empty, usable index', () => {
    const index = createSearchIndex();
    expect(index.search('anything')).toEqual([]);
  });

  it('createMiniSearchOptions exposes the standard fields', () => {
    const options = createMiniSearchOptions();
    expect(options.fields).toContain('title');
    expect(options.fields).toContain('notesText');
    expect(options.storeFields).toEqual(['id']);
  });

  it('normalizeTerm strips diacritics and lowercases', () => {
    expect(normalizeTerm('Müller')).toBe('muller');
  });
});

describe('SearchService with a worker pool', () => {
  function makeEntries(): MockEntry[] {
    return [
      new MockEntry({ id: 'w1', title: 'Worker Built Index' }),
      new MockEntry({ id: 'w2', title: 'Another Title' }),
    ];
  }

  it('builds the index via the worker and serves searches from it', async () => {
    const post = jest.fn().mockImplementation((msg: WorkerRequest) => {
      expect(msg.kind).toBe(WORKER_TASK_KINDS.BuildIndex);
      if (msg.kind !== WORKER_TASK_KINDS.BuildIndex) throw new Error('bad');
      return Promise.resolve({
        indexJson: buildSearchIndexJson(msg.documents),
      });
    });
    const service = new SearchService({ post } as unknown as WorkerManager);

    await service.buildIndex(makeEntries());

    expect(post).toHaveBeenCalledTimes(1);
    expect(service.search('worker')).toContain('w1');
    expect(service.isReady).toBe(true);
  });

  it('falls back to a local build when the worker fails', async () => {
    const post = jest.fn().mockRejectedValue(new Error('worker down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const service = new SearchService({ post } as unknown as WorkerManager);

    await service.buildIndex(makeEntries());
    warnSpy.mockRestore();

    expect(service.search('worker')).toContain('w1');
  });
});
