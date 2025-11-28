import { SearchService } from '../search/search.service';
import { Entry } from '../types';

// Mock Entry class
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

describe('SearchService', () => {
    let service: SearchService;
    let entries: MockEntry[];

    beforeEach(() => {
        service = new SearchService();
        entries = [
            new MockEntry('1', 'Introduction to Algorithms', 'Cormen', 2009),
            new MockEntry('2', 'Clean Code', 'Martin', 2008),
            new MockEntry('3', 'The Pragmatic Programmer', 'Hunt', 1999),
        ];
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
});
