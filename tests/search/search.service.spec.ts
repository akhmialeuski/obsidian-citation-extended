import { SearchService, normalizeTerm } from '../../src/search/search.service';
import { Entry } from '../../src/core';

// Mock Entry class
class MockEntry extends Entry {
  id!: string;
  type: string = 'article-journal';
  title!: string;
  authorString!: string;
  ISBN?: string;
  eprint: string | null = null;
  eprinttype: string | null = null;
  files: string[] | null = null;

  _sourceDatabase?: string;
  _compositeCitekey?: string;

  get citekey(): string {
    return this.id;
  }

  constructor(data: Partial<Entry>, noteText?: string) {
    super();
    Object.assign(this, data);
    this.id = data.id || ''; // Ensure id is always set
    this.title = data.title || '';
    this.authorString = data.authorString || '';
    this._year = data.issuedDate?.getFullYear()?.toString() || '';
    // Inject aggregated note/highlight text so the inherited `note` getter
    // (and thus toSearchDocument().notesText) returns it.
    if (noteText !== undefined) {
      this._note = [noteText];
    }
  }

  // Implement abstract members with dummy values
  abstract = '';
  author = [];
  containerTitle = '';
  DOI = '';

  issuedDate = new Date();
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
}

describe('SearchService', () => {
  let service: SearchService;
  let entries: MockEntry[];

  beforeEach(() => {
    service = new SearchService();
    const entry1 = new MockEntry({
      id: '1',
      title: 'Introduction to Algorithms',
      authorString: 'Cormen',
      issuedDate: new Date(2009, 0, 1),
    });
    const entry2 = new MockEntry({
      id: '2',
      title: 'Clean Code',
      authorString: 'Martin',
      issuedDate: new Date(2008, 0, 1),
    });
    const entry3 = new MockEntry({
      id: '3',
      title: 'The Pragmatic Programmer',
      authorString: 'Hunt',
      issuedDate: new Date(1999, 0, 1),
    });
    entries = [entry1, entry2, entry3];
  });

  test('should index and search entries', async () => {
    await service.buildIndex(entries);

    const results = service.search('Algorithms');
    expect(results).toContain('1');
    expect(results.length).toBe(1);
  });

  test('should search by author', async () => {
    await service.buildIndex(entries);

    const results = service.search('Martin');
    expect(results).toContain('2');
  });

  test('should search by year', async () => {
    await service.buildIndex(entries);

    const results = service.search('1999');
    expect(results).toContain('3');
  });

  test('should handle empty query', async () => {
    await service.buildIndex(entries);
    expect(service.search('')).toEqual([]);
  });

  test('a newer buildIndex supersedes an in-flight one', async () => {
    // Start two overlapping builds; only the SECOND may win the swap.
    const first = service.buildIndex(entries);
    const second = service.buildIndex([entries[0]]);
    await Promise.all([first, second]);

    expect(service.search('Algorithms')).toContain('1');
    // entry2 exists only in the superseded first build.
    expect(service.search('Clean')).toEqual([]);
  });

  // Regression test for GitHub issue #220:
  // "Insert literature note link won't search by author name"
  test('should find entries by author name in Insert Literature Note Link (#220)', async () => {
    const entries = [
      new MockEntry({
        id: 'hopf2020',
        title: 'Perioperative outcomes of surgery',
        authorString: 'Hopf, John K.',
        issuedDate: new Date(2020, 0, 1),
      }),
      new MockEntry({
        id: 'smith2021',
        title: 'Another article about something',
        authorString: 'Smith, Jane',
        issuedDate: new Date(2021, 0, 1),
      }),
    ];

    await service.buildIndex(entries);

    // Search by last name
    const byLastName = service.search('Hopf');
    expect(byLastName).toContain('hopf2020');

    // Search by citekey
    const byKey = service.search('hopf2020');
    expect(byKey).toContain('hopf2020');

    // Search by partial author name
    const byPartial = service.search('Hop');
    expect(byPartial).toContain('hopf2020');
  });

  test('should search by Zotero ID', async () => {
    const zoteroEntries = [
      new MockEntry({
        id: 'smith2020',
        title: 'Some Paper',
        authorString: 'Smith',
        issuedDate: new Date(2020, 0, 1),
        zoteroId: 'W5JRT78A',
      }),
      new MockEntry({
        id: 'jones2021',
        title: 'Another Paper',
        authorString: 'Jones',
        issuedDate: new Date(2021, 0, 1),
        zoteroId: 'ABCD1234',
      }),
    ];

    await service.buildIndex(zoteroEntries);

    const results = service.search('W5JRT78A');
    expect(results).toContain('smith2020');
  });

  test('should find entry by partial Zotero ID prefix', async () => {
    const zoteroEntries = [
      new MockEntry({
        id: 'smith2020',
        title: 'Some Paper',
        authorString: 'Smith',
        issuedDate: new Date(2020, 0, 1),
        zoteroId: 'W5JRT78A',
      }),
    ];

    await service.buildIndex(zoteroEntries);

    const results = service.search('W5JRT');
    expect(results).toContain('smith2020');
  });

  describe('diacritics normalization', () => {
    test('should find entry with accented author when searching without accents', async () => {
      const diacriticEntries = [
        new MockEntry({
          id: 'maria2020',
          title: 'Some Research Paper',
          authorString: 'M\u00e2ri\u00e0a, Jean',
          issuedDate: new Date(2020, 0, 1),
        }),
      ];

      await service.buildIndex(diacriticEntries);

      const results = service.search('Maria');
      expect(results).toContain('maria2020');
    });

    test('should find entry with umlauts when searching without diacritics', async () => {
      const diacriticEntries = [
        new MockEntry({
          id: 'muller2019',
          title: 'Deutsche Forschung',
          authorString: 'M\u00fcller, Hans',
          issuedDate: new Date(2019, 0, 1),
        }),
      ];

      await service.buildIndex(diacriticEntries);

      const results = service.search('Muller');
      expect(results).toContain('muller2019');
    });

    test('should still match plain ASCII search terms', async () => {
      await service.buildIndex(entries);

      const results = service.search('Algorithms');
      expect(results).toContain('1');
      expect(results.length).toBe(1);
    });

    test('should find entry when query itself contains diacritics', async () => {
      const diacriticEntries = [
        new MockEntry({
          id: 'muller2019',
          title: 'Deutsche Forschung',
          authorString: 'M\u00fcller, Hans',
          issuedDate: new Date(2019, 0, 1),
        }),
      ];

      await service.buildIndex(diacriticEntries);

      // Searching with the accented form should also work
      const results = service.search('M\u00fcller');
      expect(results).toContain('muller2019');
    });
  });
});

describe('SearchService — note/highlight text', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService();
  });

  test('finds an entry by a phrase that appears only in its highlights', async () => {
    const entry = new MockEntry(
      { id: 'h1', title: 'Some Book', authorString: 'Author' },
      'a profound thought about serendipity',
    );
    await service.buildIndex([entry]);

    expect(service.search('serendipity')).toContain('h1');
  });

  test('ranks a title match above a note-only match', async () => {
    const titleMatch = new MockEntry({
      id: 'title',
      title: 'quantum entanglement',
      authorString: 'X',
    });
    const noteMatch = new MockEntry(
      { id: 'note', title: 'Unrelated', authorString: 'Y' },
      'quantum entanglement appears here',
    );
    await service.buildIndex([titleMatch, noteMatch]);

    const results = service.search('quantum');
    expect(results[0]).toBe('title');
    expect(results).toContain('note');
  });

  test('truncates indexed note text at the cap (late tokens are not found)', async () => {
    const early = 'earlysentinel';
    const late = 'latesentinel';
    // ~6000 chars of filler pushes `late` beyond the 5000-char index cap.
    const filler = 'x '.repeat(3000);
    const entry = new MockEntry(
      { id: 'trunc', title: 'T', authorString: 'A' },
      `${early} ${filler} ${late}`,
    );
    await service.buildIndex([entry]);

    expect(service.search(early)).toContain('trunc');
    expect(service.search(late)).not.toContain('trunc');
  });

  test('toSearchDocument caps notesText length and is empty without a note', () => {
    const withNote = new MockEntry(
      { id: 'x', title: 'T', authorString: 'A' },
      'y'.repeat(6000),
    );
    expect(withNote.toSearchDocument().notesText.length).toBe(5000);

    const withoutNote = new MockEntry({
      id: 'z',
      title: 'T',
      authorString: 'A',
    });
    expect(withoutNote.toSearchDocument().notesText).toBe('');
  });

  test('noteExcerpt stops concatenating raw segments once past the cap', () => {
    const entry = new MockEntry({ id: 'multi', title: 'T', authorString: 'A' });
    (entry as unknown as { _note: string[] })._note = [
      'first segment &amp; more',
      'x'.repeat(12_000),
      'tail segment that must not be reached',
    ];

    const text = entry.toSearchDocument().notesText;
    expect(text.length).toBe(5000);
    // Entity decoding still applies to the indexed excerpt.
    expect(text.startsWith('first segment & more')).toBe(true);
    expect(text).not.toContain('tail segment');
  });

  test('matches accented note text via an un-accented query', async () => {
    const entry = new MockEntry(
      { id: 'd1', title: 'Doc', authorString: 'A' },
      'le café était bon',
    );
    await service.buildIndex([entry]);

    expect(service.search('cafe')).toContain('d1');
  });

  test('entries without note text still index by title', async () => {
    const entry = new MockEntry({
      id: 'plain',
      title: 'Distinctive Title',
      authorString: 'A',
    });
    await service.buildIndex([entry]);

    expect(service.search('Distinctive')).toContain('plain');
  });
});

describe('normalizeTerm', () => {
  test('should strip acute and grave accents', () => {
    expect(normalizeTerm('\u00e9\u00e8')).toBe('ee');
  });

  test('should strip circumflex and diaeresis', () => {
    expect(normalizeTerm('\u00e2\u00fc')).toBe('au');
  });

  test('should convert to lowercase', () => {
    expect(normalizeTerm('HELLO')).toBe('hello');
  });

  test('should handle plain ASCII unchanged (except case)', () => {
    expect(normalizeTerm('Algorithm')).toBe('algorithm');
  });

  test('should handle combined diacritics and case', () => {
    expect(normalizeTerm('M\u00e2ri\u00e0a')).toBe('mariaa');
    expect(normalizeTerm('M\u00fcller')).toBe('muller');
  });

  test('should handle empty string', () => {
    expect(normalizeTerm('')).toBe('');
  });
});
