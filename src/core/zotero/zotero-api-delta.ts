import { ZoteroSnapshotError } from './zotero-local-api-client';
import type {
  ZoteroApiItem,
  ZoteroApiItemList,
  ZoteroApiLibraryData,
  ZoteroApiLibraryState,
  ZoteroApiScope,
  ZoteroLocalApiClient,
} from './zotero-local-api-client';

export type ZoteroApiRawLibrary = Omit<ZoteroApiLibraryData, 'libraryVersion'>;

export interface ZoteroObjectChangeCounts {
  added: number;
  modified: number;
  removed: number;
}

export type ZoteroChangeCounts = Partial<
  Record<ZoteroApiItemList, ZoteroObjectChangeCounts>
>;

/** A visible record can reappear without its version advancing, for example after restoring its parent. */
export class MissingZoteroDeltaRecordError extends ZoteroSnapshotError {
  constructor() {
    super(
      'ordered inventory contains records missing from the cache and delta',
    );
  }
}

export function mergeZoteroObjects(
  cached: readonly ZoteroApiItem[],
  changed: readonly ZoteroApiItem[],
  keys: readonly string[],
): { items: ZoteroApiItem[]; counts: ZoteroObjectChangeCounts } {
  const present = new Set(keys);
  const records = new Map(cached.map((item) => [item.key, item]));
  const counts = {
    added: 0,
    modified: 0,
    removed: cached.filter((item) => !present.has(item.key)).length,
  };

  if (changed.some((item) => !present.has(item.key))) {
    throw new ZoteroSnapshotError(
      'Zotero returned an item outside the ordered inventory.',
    );
  }
  for (const item of changed) {
    const previous = records.get(item.key);
    if (!previous) counts.added++;
    else if (previous.version !== item.version) counts.modified++;
    records.set(item.key, item);
  }

  // Preserve the adapter's citekey tie-breaking and attachment order.
  const items = keys.map((key) => {
    const item = records.get(key);
    if (!item) throw new MissingZoteroDeltaRecordError();
    return item;
  });
  return { items, counts };
}

/** Reconcile each endpoint's inventory, including children without visible parents. */
export async function fetchZoteroDelta(
  client: ZoteroLocalApiClient,
  scope: ZoteroApiScope,
  cached: { rawLibrary: ZoteroApiRawLibrary; libraryVersion: number },
  expected: ZoteroApiLibraryState,
  options: { includeAnnotations: boolean; signal: AbortSignal },
): Promise<{ library: ZoteroApiLibraryData; changes: ZoteroChangeCounts }> {
  const { includeAnnotations, signal } = options;
  const changes: ZoteroChangeCounts = {};

  async function fetchList(list: ZoteroApiItemList): Promise<ZoteroApiItem[]> {
    const keys = await client.fetchOrderedItemKeys(
      scope,
      list,
      expected,
      signal,
    );
    const records = await client.fetchItemsSince(
      scope,
      list,
      cached.libraryVersion,
      expected,
      signal,
    );
    const { items, counts } = mergeZoteroObjects(
      cached.rawLibrary[list],
      records,
      keys,
    );
    changes[list] = counts;
    return items;
  }

  // Child objects have separate versions. A change to an annotation can
  // leave both its parent attachment and the bibliographic item unchanged.
  const library = {
    items: await fetchList('items'),
    attachments: await fetchList('attachments'),
    annotations: includeAnnotations ? await fetchList('annotations') : [],
    // Collection renames can leave item versions unchanged.
    collectionNames: await client.fetchCollectionNames(scope, signal, expected),
    libraryVersion: expected.libraryVersion,
  };
  return { library, changes };
}
