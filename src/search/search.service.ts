import MiniSearch from 'minisearch';
import { Entry } from '../types';

export class SearchService {
    private index: MiniSearch;
    private isIndexing = false;

    constructor() {
        // Handle potential interoperability issues with MiniSearch import
        // @ts-ignore
        const MiniSearchConstructor = MiniSearch.default || MiniSearch;
        this.index = new MiniSearchConstructor({
            fields: ['title', 'authorString', 'year', 'id'],
            storeFields: ['id'],
            searchOptions: {
                boost: { title: 2, authorString: 1.5 },
                fuzzy: 0.2,
                prefix: true
            }
        });
    }

    public buildIndex(entries: Entry[]): void {
        this.isIndexing = true;
        // Run in next tick to avoid blocking immediately, though heavy work will still block main thread
        // unless we use a worker. For now, we do it synchronously but we can optimize later.
        // Actually, MiniSearch.addAll is synchronous.

        this.index.removeAll();

        // Prepare documents for MiniSearch
        // We need to ensure properties are strings or accessible
        const docs = entries.map(entry => ({
            id: entry.id,
            title: entry.title || '',
            authorString: entry.authorString || '',
            year: entry.year?.toString() || ''
        }));

        this.index.addAll(docs);
        this.isIndexing = false;
    }

    public search(query: string): string[] {
        if (!query) return [];
        // Return top 50 results IDs
        const results = this.index.search(query);
        return results.map(r => r.id);
    }

    public get isReady(): boolean {
        return !this.isIndexing;
    }
}
