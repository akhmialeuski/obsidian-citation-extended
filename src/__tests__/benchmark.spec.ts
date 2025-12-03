import MiniSearch from 'minisearch';
import { Entry } from '../types';

// Mock Entry class for testing
class MockEntry extends Entry {
  id!: string;
  type: string = 'article-journal';
  title!: string;
  authorString!: string;
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
    // Ensure required fields are set for the mock if not provided in data
    if (!this.id) this.id = data.id || 'mock-id';
    if (!this.title) this.title = data.title || 'Mock Title';
    if (!this.authorString)
      this.authorString = data.authorString || 'Mock Author';
    if (!this._year && data.issuedDate)
      this._year = new Date(data.issuedDate).getFullYear().toString();
    if (!this._year) this._year = '2000'; // Default year if not provided
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
  eventPlace = '';
  language = '';
  source = '';
  publisher = '';
  publisherPlace = '';
}

function generateEntries(count: number): MockEntry[] {
  const entries = Array.from({ length: count }, (_, i) => {
    return new MockEntry({
      id: `entry-${i}`,
      title: `Title ${i}`,
      authorString: `Author ${i}`,
      issuedDate: new Date(2000 + (i % 20), 0, 1),
    });
  });
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
        expect(end - start).toBeLessThan(200); // Requirement: < 200ms
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
