import MiniSearch from 'minisearch';
import { Entry, WORKER_TASK_KINDS } from '../core';
import type { BuildIndexWorkerResponse } from '../core';
import type { WorkerManager } from '../util';
import { createSearchIndex, loadSearchIndexJson } from './search-index';

export { normalizeTerm } from './search-index';

/** Default maximum number of citekeys returned by {@link SearchService.search}. */
export const DEFAULT_SEARCH_RESULT_LIMIT = 50;

/**
 * Number of documents indexed per event-loop slice during an async local
 * build. Small enough to keep the main thread responsive, large enough to
 * keep the total build time close to a synchronous build.
 */
const INDEX_CHUNK_SIZE = 200;

/**
 * Full-text search over bibliography entries powered by MiniSearch.
 * Supports fuzzy matching, prefix search, and diacritics normalization.
 */
export class SearchService {
  private index: MiniSearch;
  /**
   * Monotonic build counter. An in-flight async build compares its captured
   * version against the current one before swapping the index in, so a newer
   * build always supersedes an older one (the stale result is discarded).
   */
  private buildVersion = 0;
  private isIndexing = false;

  /**
   * @param indexWorker  Optional worker pool. When provided, index builds run
   *                     inside a Web Worker (tokenization off the main
   *                     thread); without it, builds run locally in async
   *                     chunks. Both paths swap the finished index in
   *                     atomically.
   */
  constructor(private indexWorker?: WorkerManager) {
    this.index = createSearchIndex();
  }

  /**
   * Build the search index from the given entries.
   *
   * The build happens into a fresh MiniSearch instance and is swapped in
   * atomically when complete, so searches keep working against the previous
   * index while a rebuild is in progress (stale-while-revalidate). When a
   * newer build starts before this one finishes, the stale result is
   * discarded.
   */
  public async buildIndex(entries: Entry[]): Promise<void> {
    const version = ++this.buildVersion;
    this.isIndexing = true;

    const docs = entries.map((entry) => entry.toSearchDocument());

    let fresh: MiniSearch | null = null;

    if (this.indexWorker) {
      try {
        const response = await this.indexWorker.post<BuildIndexWorkerResponse>({
          kind: WORKER_TASK_KINDS.BuildIndex,
          documents: docs,
        });
        if (version !== this.buildVersion) return; // superseded
        fresh = await loadSearchIndexJson(response.indexJson);
      } catch (e) {
        // Worker unavailable/failed: fall back to the local async build.
        console.warn(
          'SearchService: worker index build failed, building locally',
          e,
        );
      }
    }

    if (!fresh) {
      fresh = createSearchIndex();
      await fresh.addAllAsync(docs, { chunkSize: INDEX_CHUNK_SIZE });
    }

    if (version !== this.buildVersion) return; // superseded by a newer build

    this.index = fresh;
    this.isIndexing = false;
  }

  /**
   * Search the index and return the top matching citekeys, ranked by score.
   *
   * @param limit  Maximum number of citekeys to return. The cut happens here,
   *               before mapping, so wide queries don't materialize thousands
   *               of intermediate ids the caller would throw away.
   */
  public search(
    query: string,
    limit: number = DEFAULT_SEARCH_RESULT_LIMIT,
  ): string[] {
    if (!query) return [];
    const results = this.index.search(query);
    return results.slice(0, limit).map((r) => r.id as string);
  }

  public get isReady(): boolean {
    return !this.isIndexing;
  }
}
