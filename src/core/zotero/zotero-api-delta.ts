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

/** Compare the complete inventory so absent keys also reveal deletions. */
export function diffZoteroObjects(
  cached: readonly ZoteroApiItem[],
  versions: ReadonlyMap<string, number>,
): { changed: Map<string, number>; removed: string[]; added: number } {
  const previous = new Map(cached.map((item) => [item.key, item.version]));
  const changed = new Map<string, number>();
  let added = 0;
  for (const [key, version] of versions) {
    const previousVersion = previous.get(key);
    if (previousVersion === undefined) added++;
    if (previousVersion !== version) changed.set(key, version);
  }
  return {
    changed,
    added,
    removed: [...previous.keys()].filter((key) => !versions.has(key)),
  };
}

export function mergeZoteroObjects(
  cached: readonly ZoteroApiItem[],
  changed: readonly ZoteroApiItem[],
  removed: readonly string[],
  keys: readonly string[],
  versions: ReadonlyMap<string, number>,
): ZoteroApiItem[] {
  const records = new Map(cached.map((item) => [item.key, item]));
  for (const key of removed) records.delete(key);
  for (const item of changed) records.set(item.key, item);

  if (keys.length !== versions.size) {
    throw new ZoteroSnapshotError('Zotero item inventories disagree.');
  }
  // The ordered key response controls the adapter's iteration order. This
  // preserves citekey tie-breaking and attachment order after additions or edits.
  return keys.map((key) => {
    const item = records.get(key);
    if (!item || item.version !== versions.get(key)) {
      throw new ZoteroSnapshotError('Zotero item inventories disagree.');
    }
    return item;
  });
}

/** Reconcile each endpoint's inventory, including children without visible parents. */
export async function fetchZoteroDelta(
  client: ZoteroLocalApiClient,
  scope: ZoteroApiScope,
  cached: ZoteroApiRawLibrary,
  expected: ZoteroApiLibraryState,
  options: { includeAnnotations: boolean; signal: AbortSignal },
): Promise<{ library: ZoteroApiLibraryData; changes: ZoteroChangeCounts }> {
  const { includeAnnotations, signal } = options;
  const changes: ZoteroChangeCounts = {};

  async function fetchList(list: ZoteroApiItemList): Promise<ZoteroApiItem[]> {
    const versions = await client.fetchItemVersions(
      scope,
      list,
      expected,
      signal,
    );
    const keys = await client.fetchOrderedItemKeys(
      scope,
      list,
      expected,
      signal,
    );
    const { added, changed, removed } = diffZoteroObjects(
      cached[list],
      versions,
    );
    changes[list] = {
      added,
      modified: changed.size - added,
      removed: removed.length,
    };
    const records = await client.fetchItemsByKey(
      scope,
      list,
      changed,
      expected,
      signal,
    );
    return mergeZoteroObjects(cached[list], records, removed, keys, versions);
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
