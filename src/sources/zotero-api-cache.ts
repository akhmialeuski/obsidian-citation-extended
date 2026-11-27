/**
 * Persistent snapshots for Zotero Local API sources.
 *
 * V3 stores normalized entries for offline use and keeps ordered raw
 * records for incremental reconciliation of tracked whole libraries. It
 * records the endpoint, scope, annotation setting, server ID, and library
 * version so the source can check compatibility before reusing a snapshot.
 *
 * V2 stores entries without an endpoint or server ID. The source accepts
 * it as an offline fallback only at the default endpoint with matching
 * settings. A successful online full fetch replaces it with V3.
 */
import type { ZoteroApiEntryData } from '../core/adapters/zotero-api-adapter';
import type { ZoteroApiRawLibrary } from '../core/zotero/zotero-api-delta';
import {
  isZoteroApiItem,
  isZoteroRecord,
  isZoteroVersion,
  supportsLocalVersions,
} from '../core/zotero/zotero-local-api-client';
import type {
  ZoteroApiLibraryData,
  ZoteroApiLibraryState,
} from '../core/zotero/zotero-local-api-client';

/** Common fields stored in the last successful on-disk snapshot. */
interface CachedEntries {
  // The stable database ID determines the filename. These fetch parameters
  // identify the contents when that same file is reused after a setting change.
  groupId: string;
  collectionKey: string;
  importAnnotations: boolean;
  /** Pre-built DTOs for offline and unchanged loads. */
  entries: ZoteroApiEntryData[];
  /** Library version at fetch time, or null when unavailable. */
  libraryVersion: number | null;
}

export interface ZoteroApiCacheV3 extends CachedEntries, ZoteroApiLibraryState {
  version: 3;
  baseUrl: string;
  /** Ordered adapter inputs retained only for tracked whole-library snapshots. */
  rawLibrary?: ZoteroApiRawLibrary;
}

/** V2 has no endpoint, server identity, or raw objects and is usable only as an offline fallback. */
export type ZoteroApiCache =
  (CachedEntries & { version: 2 }) | ZoteroApiCacheV3;

function isItemList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(isZoteroApiItem) &&
    new Set(value.map((item) => item.key)).size === value.length
  );
}

function isRawLibrary(value: unknown): value is ZoteroApiRawLibrary {
  return (
    isZoteroRecord(value) &&
    isItemList(value.items) &&
    isItemList(value.attachments) &&
    isItemList(value.annotations) &&
    isZoteroRecord(value.collectionNames) &&
    Object.values(value.collectionNames).every(
      (name) => typeof name === 'string',
    )
  );
}

function isEntry(value: unknown): boolean {
  return (
    isZoteroRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.citekey === 'string' &&
    isZoteroRecord(value.csl)
  );
}

function isCacheV3(value: Record<string, unknown>): boolean {
  return (
    typeof value.baseUrl === 'string' &&
    value.baseUrl.length > 0 &&
    (value.serverId === null ||
      (typeof value.serverId === 'string' && value.serverId.length > 0)) &&
    (value.rawLibrary === undefined || isRawLibrary(value.rawLibrary))
  );
}

function hasCachedEntries(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.entries) &&
    value.entries.every(isEntry) &&
    typeof value.groupId === 'string' &&
    typeof value.collectionKey === 'string' &&
    typeof value.importAnnotations === 'boolean'
  );
}

export function isZoteroApiCache(value: unknown): value is ZoteroApiCache {
  if (!isZoteroRecord(value) || !hasCachedEntries(value)) return false;
  if (value.version === 2) {
    return (
      value.libraryVersion === null ||
      Number.isSafeInteger(value.libraryVersion)
    );
  }
  return (
    value.version === 3 &&
    (value.libraryVersion === null || isZoteroVersion(value.libraryVersion)) &&
    isCacheV3(value)
  );
}

export function snapshotToCache(
  library: ZoteroApiLibraryData,
  entries: ZoteroApiEntryData[],
  state: ZoteroApiLibraryState,
  config: Pick<
    ZoteroApiCacheV3,
    'groupId' | 'collectionKey' | 'importAnnotations' | 'baseUrl'
  >,
): ZoteroApiCacheV3 {
  const cache: ZoteroApiCacheV3 = { version: 3, ...config, ...state, entries };

  if (!config.collectionKey && supportsLocalVersions(state)) {
    const { items, attachments, annotations, collectionNames } = library;
    cache.rawLibrary = { items, attachments, annotations, collectionNames };
  }
  return cache;
}
