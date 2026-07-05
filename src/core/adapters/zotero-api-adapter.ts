/**
 * Adapter and entry builder for the native Zotero local API source.
 *
 * The builder turns raw local-API items into self-contained
 * {@link ZoteroApiEntryData} DTOs (also the on-disk cache format), resolving:
 *
 * - **Citekeys**, in priority order:
 *   1. the native `data.citationKey` field (Zotero 7.0.31+; fully rolled out
 *      in Zotero 8 — Better BibTeX keys are auto-migrated there),
 *   2. a legacy `Citation Key: xxx` line in the Extra field (the pre-native
 *      Better BibTeX pinning convention),
 *   3. a generated `lastnameYear` fallback, deduplicated with letter
 *      suffixes (`smith2023`, `smith2023a`, …).
 * - **Bibliographic fields** from the item's CSL-JSON projection
 *   (`include=csljson`) when present, else a minimal mapping from the native
 *   `data` fields.
 * - **Files** synthesized as `storage/<attachmentKey>/<filename>` paths so
 *   the existing `zoteroPdfURI`/`pdfLink` template helpers keep working.
 * - **Collection names** from the collections map.
 */

import { Entry } from '../types/entry';
import type { Annotation, AttachmentRef } from '../types/annotation';
import {
  basenameWithoutExtension,
  mapZoteroAnnotation,
} from '../zotero/zotero-annotations';
import type { Author } from '../types/entry';
import { EntryCSLAdapter } from './csl-adapter';
import type { EntryDataCSL } from './csl-adapter';
import type {
  ZoteroApiItem,
  ZoteroApiLibraryData,
} from '../zotero/zotero-local-api-client';

/** Self-contained entry data for the Zotero local API source (cacheable). */
export interface ZoteroApiEntryData {
  /** Zotero item key. */
  key: string;
  /** Zotero object version. */
  version: number;
  /** Resolved citekey (see module docs for the resolution chain). */
  citekey: string;
  /** CSL-JSON payload with `id` = citekey and `zotero-key` = item key. */
  csl: EntryDataCSL;
  /** Synthesized attachment file paths (`storage/<KEY>/<filename>`). */
  files?: string[];
  /** Collection names the item belongs to. */
  collections?: string[];
  /**
   * Native structured Zotero tags. Kept first-class so a tag containing a
   * comma is never split by the CSL keyword-string round-trip.
   */
  tags?: string[];
  /** Group library id when fetched from a group scope ('' = personal). */
  groupId?: string;
  /** Normalized PDF annotations (source-agnostic shape), when imported. */
  annotations?: Annotation[];
  /** Attachment references matching the uniform Entry interface. */
  attachmentRefs?: AttachmentRef[];
  /** ISO timestamps from Zotero. */
  dateAdded?: string;
  dateModified?: string;
}

/**
 * Entry adapter for {@link ZoteroApiEntryData}. Reuses all CSL field logic
 * from {@link EntryCSLAdapter} and adds Zotero-specific surface: files,
 * collection names, and an `entry.zotero` object for templates.
 */
export class ZoteroApiAdapter extends EntryCSLAdapter {
  /** Zotero-native identifiers, exposed to templates as `entry.zotero.*`. */
  public readonly zotero: {
    key: string;
    version: number;
    dateAdded?: string;
    dateModified?: string;
  };

  /** Native tags (structured, comma-safe) — see {@link keywords}. */
  private readonly nativeTags?: string[];
  /** Group library id ('' / undefined = personal library). */
  private readonly groupId?: string;

  constructor(data: ZoteroApiEntryData) {
    super(data.csl);
    this.files = data.files ?? null;
    this.collections = data.collections;
    this.nativeTags = data.tags;
    this.groupId = data.groupId;
    this.zotero = {
      key: data.key,
      version: data.version,
      dateAdded: data.dateAdded,
      dateModified: data.dateModified,
    };
    if (data.annotations?.length || data.attachmentRefs?.length) {
      this.setAnnotations(data.annotations ?? [], data.attachmentRefs ?? []);
    }
  }

  /**
   * Native structured tags, NOT the CSL keyword string re-split on commas —
   * a Zotero tag like "reading, methodology" stays one tag. Falls back to
   * the CSL parsing for cached DTOs written before tags were structured.
   */
  get keywords(): string[] | undefined {
    if (this.nativeTags && this.nativeTags.length > 0) return this.nativeTags;
    return super.keywords;
  }

  /**
   * Native Zotero select URI built from the real item key. The inherited
   * `zotero://select/items/@citekey` form is a Better BibTeX handler that
   * does not exist on the BBT-less installs this source targets.
   */
  get zoteroSelectURI(): string {
    return this.groupId
      ? `zotero://select/groups/${this.groupId}/items/${this.zotero.key}`
      : `zotero://select/library/items/${this.zotero.key}`;
  }
}

/** `Citation Key: xxx` line in the Extra field (legacy BBT convention). */
const EXTRA_CITEKEY_RE = /^\s*citation key\s*:\s*(\S+)\s*$/im;

function nativeCitekey(data: Record<string, unknown>): string | null {
  const key = data.citationKey;
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : null;
}

function extraCitekey(data: Record<string, unknown>): string | null {
  const extra = data.extra;
  if (typeof extra !== 'string') return null;
  const match = extra.match(EXTRA_CITEKEY_RE);
  return match ? match[1] : null;
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

function generatedCitekey(item: ZoteroApiItem): string {
  const creators = Array.isArray(item.data.creators)
    ? (item.data.creators as Array<Record<string, unknown>>)
    : [];
  const first = creators[0];
  const name =
    (typeof first?.lastName === 'string' && first.lastName) ||
    (typeof first?.name === 'string' && first.name) ||
    'item';

  const parsedDate =
    typeof item.meta?.parsedDate === 'string' ? item.meta.parsedDate : '';
  const dataDate = typeof item.data.date === 'string' ? item.data.date : '';
  const yearMatch = (parsedDate || dataDate).match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : '';

  const base = `${slug(name) || 'item'}${year}`;
  return base.length > 0 ? base : item.key.toLowerCase();
}

/** The item's user-pinned citekey (native field or Extra line), or null. */
function pinnedCitekey(item: ZoteroApiItem): string | null {
  return nativeCitekey(item.data) ?? extraCitekey(item.data);
}

/**
 * Deduplicate `base` against `taken`: suffix BBT-style (smith2023a, …) and
 * fall back to the unique Zotero key when the alphabet is exhausted.
 */
function dedupeCitekey(
  base: string,
  taken: Set<string>,
  itemKey: string,
): string {
  if (!taken.has(base)) return base;
  for (let i = 0; i < 26; i++) {
    const candidate = `${base}${String.fromCharCode(97 + i)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${itemKey.toLowerCase()}`;
}

/** Native Zotero itemType → CSL type (subset; unknown types → 'document'). */
const ITEM_TYPE_TO_CSL: Record<string, string> = {
  journalArticle: 'article-journal',
  magazineArticle: 'article-magazine',
  newspaperArticle: 'article-newspaper',
  preprint: 'article',
  book: 'book',
  bookSection: 'chapter',
  conferencePaper: 'paper-conference',
  thesis: 'thesis',
  report: 'report',
  webpage: 'webpage',
  blogPost: 'post-weblog',
  manuscript: 'manuscript',
  presentation: 'speech',
  document: 'document',
  dataset: 'dataset',
  software: 'software',
  videoRecording: 'motion_picture',
  podcast: 'broadcast',
  patent: 'patent',
  case: 'legal_case',
  statute: 'legislation',
  letter: 'personal_communication',
  interview: 'interview',
  map: 'map',
};

function creatorsToAuthors(
  creators: unknown,
  creatorType: 'author' | 'editor',
): Author[] {
  if (!Array.isArray(creators)) return [];
  return (creators as Array<Record<string, unknown>>)
    .filter((c) => (c.creatorType ?? 'author') === creatorType)
    .map((c) => {
      if (typeof c.name === 'string') return { literal: c.name };
      return {
        given: typeof c.firstName === 'string' ? c.firstName : undefined,
        family: typeof c.lastName === 'string' ? c.lastName : undefined,
      };
    });
}

function tagNames(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.tags)) return [];
  return (data.tags as Array<Record<string, unknown>>)
    .map((t) => (typeof t.tag === 'string' ? t.tag : null))
    .filter((t): t is string => t !== null);
}

function issuedFrom(item: ZoteroApiItem): EntryDataCSL['issued'] | undefined {
  const parsedDate =
    typeof item.meta?.parsedDate === 'string' ? item.meta.parsedDate : '';
  const dataDate = typeof item.data.date === 'string' ? item.data.date : '';
  const source = parsedDate || dataDate;
  const match = source.match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!match) return undefined;
  const parts: (number | string)[] = [parseInt(match[1], 10)];
  if (match[2]) parts.push(parseInt(match[2], 10));
  if (match[3]) parts.push(parseInt(match[3], 10));
  return { 'date-parts': [parts] };
}

function firstString(
  data: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Build a minimal CSL record from native item data (no csljson present). */
function cslFromNativeData(item: ZoteroApiItem, citekey: string): EntryDataCSL {
  const data = item.data;
  const itemType = typeof data.itemType === 'string' ? data.itemType : '';
  const author = creatorsToAuthors(data.creators, 'author');
  const editor = creatorsToAuthors(data.creators, 'editor');

  const csl: EntryDataCSL = {
    id: citekey,
    type: ITEM_TYPE_TO_CSL[itemType] ?? 'document',
    title: firstString(data, ['title']),
    abstract: firstString(data, ['abstractNote']),
    DOI: firstString(data, ['DOI']),
    ISBN: firstString(data, ['ISBN']),
    URL: firstString(data, ['url']),
    'container-title': firstString(data, [
      'publicationTitle',
      'bookTitle',
      'proceedingsTitle',
      'websiteTitle',
      'blogTitle',
    ]),
    publisher: firstString(data, ['publisher', 'university', 'institution']),
    'publisher-place': firstString(data, ['place']),
    volume: firstString(data, ['volume']),
    page: firstString(data, ['pages']),
    language: firstString(data, ['language']),
    'title-short': firstString(data, ['shortTitle']),
    issued: issuedFrom(item),
  };
  if (author.length > 0) csl.author = author;
  if (editor.length > 0) csl.editor = editor;
  return csl;
}

/** Take the API's csljson projection when usable, else map native data. */
function buildCsl(item: ZoteroApiItem, citekey: string): EntryDataCSL {
  const projected = item.csljson;
  const csl: EntryDataCSL =
    projected && typeof projected === 'object' && 'type' in projected
      ? ({ ...projected } as unknown as EntryDataCSL)
      : cslFromNativeData(item, citekey);

  // The projection's id is a Zotero URI/number — always use the citekey, and
  // carry the item key for search + zotero://select links.
  csl.id = citekey;
  csl['zotero-key'] = item.key;
  if (!csl.keyword) {
    const tags = tagNames(item.data);
    if (tags.length > 0) csl.keyword = tags.join(', ');
  }
  return csl;
}

/** linkModes whose files live inside the Zotero storage directory. */
const STORED_LINK_MODES = new Set(['imported_file', 'imported_url']);

/** One parent item's attachment, resolved for file + annotation synthesis. */
interface ApiAttachmentInfo {
  /** Zotero attachment item key. */
  key: string;
  /**
   * Synthesized file path — `storage/<KEY>/<filename>` for stored files (the
   * shape the `zoteroPdfURI` helpers parse), the raw path for linked files,
   * or null for link-only attachments (URLs).
   */
  file: string | null;
  /** Display title: file basename, else the attachment's own title. */
  title: string | null;
}

/** Group attachment items by their parent item key. */
function attachmentsByParent(
  attachments: ZoteroApiItem[],
): Map<string, ApiAttachmentInfo[]> {
  const byParent = new Map<string, ApiAttachmentInfo[]>();
  for (const attachment of attachments) {
    const data = attachment.data;
    const parent = typeof data.parentItem === 'string' ? data.parentItem : null;
    if (!parent) continue;

    let file: string | null = null;
    const linkMode = typeof data.linkMode === 'string' ? data.linkMode : '';
    if (STORED_LINK_MODES.has(linkMode)) {
      const filename = typeof data.filename === 'string' ? data.filename : '';
      if (filename) file = `storage/${attachment.key}/${filename}`;
    } else if (linkMode === 'linked_file') {
      const path = typeof data.path === 'string' ? data.path : '';
      if (path) file = path.replace(/^attachments:/, '');
    } else if (linkMode === 'linked_url') {
      // A bare web link: no file, and Zotero cannot annotate it — skip.
      continue;
    }

    const list = byParent.get(parent) ?? [];
    list.push({
      key: attachment.key,
      file,
      title:
        basenameWithoutExtension(file) ??
        (typeof data.title === 'string' && data.title.length > 0
          ? data.title
          : null),
    });
    byParent.set(parent, list);
  }
  return byParent;
}

/**
 * Build the annotations and attachment refs for one item from its attachment
 * infos and the per-attachment annotation groups. Annotations are ordered by
 * Zotero's zero-padded sortIndex (== reading order) within each attachment.
 */
function annotationsForItem(
  infos: ApiAttachmentInfo[],
  annotationsByAttachment: Map<string, ZoteroApiItem[]>,
  openBase: string,
): { annotations: Annotation[]; attachmentRefs: AttachmentRef[] } {
  const annotations: Annotation[] = [];
  const attachmentRefs: AttachmentRef[] = [];
  for (const info of infos) {
    const openURI = `zotero://open-pdf/${openBase}/items/${info.key}`;
    const mapped = (annotationsByAttachment.get(info.key) ?? [])
      .map((a) => mapZoteroAnnotation(a.data, a.key, openURI))
      .sort((x, y) => x.sortIndex.localeCompare(y.sortIndex));
    annotations.push(...mapped);
    attachmentRefs.push({
      id: info.key,
      path: info.file,
      title: info.title,
      openURI,
      annotationCount: mapped.length,
    });
  }
  return { annotations, attachmentRefs };
}

/**
 * Convert a fetched library into cacheable entry DTOs, resolving citekeys,
 * CSL payloads, files, and collection names.
 */
export function buildZoteroApiEntries(
  library: ZoteroApiLibraryData,
  scope: { groupId?: string } = {},
): ZoteroApiEntryData[] {
  const attachmentInfos = attachmentsByParent(library.attachments);
  const openBase = scope.groupId ? `groups/${scope.groupId}` : 'library';

  // Annotations arrive as one flat sweep; group by their parent attachment
  // so each entry only walks its own attachments' annotations.
  const annotationsByAttachment = new Map<string, ZoteroApiItem[]>();
  for (const annotation of library.annotations ?? []) {
    if (!annotation.data || typeof annotation.data !== 'object') continue;
    const parent = annotation.data.parentItem;
    if (typeof parent !== 'string') continue;
    const list = annotationsByAttachment.get(parent) ?? [];
    list.push(annotation);
    annotationsByAttachment.set(parent, list);
  }

  const taken = new Set<string>();
  const entries: ZoteroApiEntryData[] = [];

  // Pass 1: user-pinned citekeys (native field / Extra line) claim their
  // names FIRST, regardless of API order — otherwise a generated
  // lastnameYear key from an earlier item could steal a pinned key from a
  // later item, silently re-pointing the user's existing notes and links.
  // Only two items pinning the SAME key contend, first in API order wins.
  const pinnedKeys = new Map<string, string>();
  for (const item of library.items) {
    if (!item.data || typeof item.data !== 'object') continue;
    const pinned = pinnedCitekey(item);
    if (!pinned) continue;
    const key = dedupeCitekey(pinned, taken, item.key);
    pinnedKeys.set(item.key, key);
    taken.add(key);
  }

  for (const item of library.items) {
    if (!item.data || typeof item.data !== 'object') continue;
    const citekey =
      pinnedKeys.get(item.key) ??
      dedupeCitekey(generatedCitekey(item), taken, item.key);
    taken.add(citekey);

    const collectionKeys = Array.isArray(item.data.collections)
      ? (item.data.collections as unknown[])
      : [];
    const collections = collectionKeys
      .map((key) =>
        typeof key === 'string' ? library.collectionNames[key] : undefined,
      )
      .filter((name): name is string => typeof name === 'string');

    const infos = attachmentInfos.get(item.key) ?? [];
    const { annotations, attachmentRefs } = annotationsForItem(
      infos,
      annotationsByAttachment,
      openBase,
    );
    const fileList = infos
      .map((info) => info.file)
      .filter((file): file is string => file !== null);

    const tags = tagNames(item.data);
    entries.push({
      key: item.key,
      version: item.version,
      citekey,
      csl: buildCsl(item, citekey),
      files: fileList.length > 0 ? fileList : undefined,
      collections: collections.length > 0 ? collections : undefined,
      tags: tags.length > 0 ? tags : undefined,
      groupId: scope.groupId || undefined,
      annotations: annotations.length > 0 ? annotations : undefined,
      attachmentRefs: attachmentRefs.length > 0 ? attachmentRefs : undefined,
      dateAdded:
        typeof item.data.dateAdded === 'string'
          ? item.data.dateAdded
          : undefined,
      dateModified:
        typeof item.data.dateModified === 'string'
          ? item.data.dateModified
          : undefined,
    });
  }

  return entries;
}

/** Wrap DTOs in adapters (used by the entry-adapter factory). */
export function zoteroApiEntriesToAdapters(
  entries: ZoteroApiEntryData[],
): Entry[] {
  return entries.map((e) => new ZoteroApiAdapter(e));
}
