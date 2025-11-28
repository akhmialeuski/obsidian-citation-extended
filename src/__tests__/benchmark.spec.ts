import MiniSearch from 'minisearch';
import { Entry } from '../types';

// Mock Entry class for testing
class MockEntry extends Entry {
  id: string;
  type: string = 'article-journal';
  title: string;
  authorString: string;

  constructor(id: string, title: string, author: string, year: number) {
    super();
    this.id = id;
    this.title = title;
    this.authorString = author;
    this._year = year.toString();
  }

  // Implement abstract members with dummy values
  abstract = '';
  author = [];
  containerTitle = '';
  DOI = '';
  files = [];
  issuedDate = new Date();
  page = '';
  titleShort = '';
  URL = '';
  eventPlace = '';
  language = '';
  source = '';
  publisher = '';
  publisherPlace = '';
  eprint = '';
  eprinttype = '';
}

function generateEntries(count: number): MockEntry[] {
  const entries: MockEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push(
      new MockEntry(
        `citekey_${i}`,
        `Title of the paper number ${i} about something interesting`,
        `Author Number ${i}, Co-Author ${i}`,
        2000 + (i % 23),
      ),
    );
  }
  return entries;
}

describe('Search Performance Benchmark', () => {
  const sizes = [10000, 50000];

  sizes.forEach((size) => {
    describe(`${size} entries`, () => {
      let entries: MockEntry[];
      let miniSearch: MiniSearch;

      beforeAll(() => {
        entries = generateEntries(size);

        const start = performance.now();
        miniSearch = new MiniSearch({
          fields: ['title', 'authorString', 'year'],
          storeFields: ['id'],
        });
        miniSearch.addAll(entries);
        const end = performance.now();
        console.log(
          `[${size}] MiniSearch Indexing: ${(end - start).toFixed(2)}ms`,
        );
        expect(end - start).toBeLessThan(5000); // Should be reasonable
      });

      test('MiniSearch: Search time (prefix)', () => {
        const start = performance.now();
        const results = miniSearch.search('interes', { prefix: true });
        const end = performance.now();
        console.log(
          `[${size}] MiniSearch Search (prefix): ${(end - start).toFixed(2)}ms, found ${results.length}`,
        );
        expect(end - start).toBeLessThan(100); // Requirement: < 100ms
      });

      test('MiniSearch: Search time (fuzzy)', () => {
        const start = performance.now();
        const results = miniSearch.search('someting', { fuzzy: 0.2 });
        const end = performance.now();
        console.log(
          `[${size}] MiniSearch Search (fuzzy): ${(end - start).toFixed(2)}ms, found ${results.length}`,
        );
        expect(end - start).toBeLessThan(200);
      });

      test('Naive Filter: Search time', () => {
        const start = performance.now();
        const query = 'interes';
        const results = entries.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            (e.authorString && e.authorString.toLowerCase().includes(query)),
        );
        const end = performance.now();
        console.log(
          `[${size}] Naive Filter Search: ${(end - start).toFixed(2)}ms, found ${results.length}`,
        );
      });
    });
  });
});
