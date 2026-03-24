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

  constructor(data: Partial<Entry>) {
    super();
    Object.assign(this, data);
    this.id = data.id || ''; // Ensure id is always set
    this.title = data.title || '';
    this.authorString = data.authorString || '';
    this._year = data.issuedDate?.getFullYear()?.toString() || '';
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

  test('should index and search entries', () => {
    service.buildIndex(entries);

    const results = service.search('Algorithms');
    expect(results).toContain('1');
    expect(results.length).toBe(1);
  });

  test('should search by author', () => {
    service.buildIndex(entries);

    const results = service.search('Martin');
    expect(results).toContain('2');
  });

  test('should search by year', () => {
    service.buildIndex(entries);

    const results = service.search('1999');
    expect(results).toContain('3');
  });

  test('should handle empty query', () => {
    service.buildIndex(entries);
    expect(service.search('')).toEqual([]);
  });

  test('isReady should return true when not indexing', () => {
    expect(service.isReady).toBe(true);
  });

  test('isReady should return true after buildIndex completes', () => {
    service.buildIndex(entries);
    expect(service.isReady).toBe(true);
  });

  // Regression test for GitHub issue #220:
  // "Insert literature note link won't search by author name"
  test('should find entries by author name in Insert Literature Note Link (#220)', () => {
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

    service.buildIndex(entries);

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

  test('should search by Zotero ID', () => {
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

    service.buildIndex(zoteroEntries);

    const results = service.search('W5JRT78A');
    expect(results).toContain('smith2020');
  });

  test('should find entry by partial Zotero ID prefix', () => {
    const zoteroEntries = [
      new MockEntry({
        id: 'smith2020',
        title: 'Some Paper',
        authorString: 'Smith',
        issuedDate: new Date(2020, 0, 1),
        zoteroId: 'W5JRT78A',
      }),
    ];

    service.buildIndex(zoteroEntries);

    const results = service.search('W5JRT');
    expect(results).toContain('smith2020');
  });

  describe('diacritics normalization', () => {
    test('should find entry with accented author when searching without accents', () => {
      const diacriticEntries = [
        new MockEntry({
          id: 'maria2020',
          title: 'Some Research Paper',
          authorString: 'M\u00e2ri\u00e0a, Jean',
          issuedDate: new Date(2020, 0, 1),
        }),
      ];

      service.buildIndex(diacriticEntries);

      const results = service.search('Maria');
      expect(results).toContain('maria2020');
    });

    test('should find entry with umlauts when searching without diacritics', () => {
      const diacriticEntries = [
        new MockEntry({
          id: 'muller2019',
          title: 'Deutsche Forschung',
          authorString: 'M\u00fcller, Hans',
          issuedDate: new Date(2019, 0, 1),
        }),
      ];

      service.buildIndex(diacriticEntries);

      const results = service.search('Muller');
      expect(results).toContain('muller2019');
    });

    test('should still match plain ASCII search terms', () => {
      service.buildIndex(entries);

      const results = service.search('Algorithms');
      expect(results).toContain('1');
      expect(results.length).toBe(1);
    });

    test('should find entry when query itself contains diacritics', () => {
      const diacriticEntries = [
        new MockEntry({
          id: 'muller2019',
          title: 'Deutsche Forschung',
          authorString: 'M\u00fcller, Hans',
          issuedDate: new Date(2019, 0, 1),
        }),
      ];

      service.buildIndex(diacriticEntries);

      // Searching with the accented form should also work
      const results = service.search('M\u00fcller');
      expect(results).toContain('muller2019');
    });
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
