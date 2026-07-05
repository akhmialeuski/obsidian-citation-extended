/**
 * Types and normalization for native Zotero PDF annotations fetched via the
 * Better BibTeX JSON-RPC `item.attachments` method.
 *
 * BBT returns, per citekey, an array of attachments shaped roughly as
 * `{ open: 'zotero://open-pdf/library/items/KEY', path: '/abs/file.pdf',
 *    annotations?: [...] }` where each annotation is the raw Zotero
 * `toJSON()` output (`annotationType`, `annotationText`, `annotationComment`,
 * `annotationColor`, `annotationPageLabel`, `annotationSortIndex`, parsed
 * `annotationPosition`, `annotationImagePath` for image annotations, `tags`).
 *
 * Everything here is defensive: fields may be missing depending on the
 * Zotero/BBT version, so normalization never throws on malformed items.
 *
 * This is Zotero's ADAPTER to the source-agnostic {@link Annotation} model:
 * it maps BBT payloads into the same interface Readwise (and any future
 * source) map into, so `entry.annotations` reads uniformly.
 */

import type { Annotation, AttachmentRef } from '../types/annotation';

/** Zotero's eight default highlight colors (hex → name). */
export const ZOTERO_ANNOTATION_COLOR_NAMES: Record<string, string> = {
  '#ffd400': 'yellow',
  '#ff6666': 'red',
  '#5fb236': 'green',
  '#2ea8e5': 'blue',
  '#a28ae5': 'purple',
  '#e56eee': 'magenta',
  '#f19837': 'orange',
  '#aaaaaa': 'gray',
};

/** Resolve a hex annotation color to its Zotero palette name, or null. */
export function zoteroColorName(color: string | undefined): string | null {
  if (!color) return null;
  return ZOTERO_ANNOTATION_COLOR_NAMES[color.toLowerCase()] ?? null;
}

/**
 * Order two Zotero annotation `sortIndex` strings by UTF-16 code unit — NOT
 * by locale. Zotero constructs sortIndex specifically for byte-wise ordering
 * (`page|offsetY|offsetX`, zero-padded). `String.prototype.localeCompare`
 * applies ICU collation, which weights digits and the `|` separator
 * differently and varies by the user's locale; for variable-width segments
 * (e.g. EPUB/snapshot CFI sortIndexes) that can reorder annotations, and
 * because the order feeds rendered note blocks it would produce spurious
 * three-way-merge conflicts across machines with different locales.
 */
export function compareSortIndex(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Result of normalizing one citekey's `item.attachments` response. */
export interface NormalizedAttachments {
  attachments: AttachmentRef[];
  /** All annotations across attachments, in document order per attachment. */
  annotations: Annotation[];
}

/** Extract an item key from a `zotero://open-pdf/...` URI. */
const OPEN_URI_KEY_RE = /\/items\/([A-Za-z0-9]+)/;
/** Extract a storage key from a `.../storage/<KEY>/...` file path. */
const STORAGE_KEY_RE = /(?:^|[\\/])storage[\\/]([A-Za-z0-9]+)[\\/]/;

function attachmentKeyOf(open: unknown, path: unknown): string | null {
  if (typeof open === 'string') {
    const match = open.match(OPEN_URI_KEY_RE);
    if (match) return match[1];
  }
  if (typeof path === 'string') {
    const match = path.match(STORAGE_KEY_RE);
    if (match) return match[1];
  }
  return null;
}

/** File basename without its extension, or null (used as attachment title). */
export function basenameWithoutExtension(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) return null;
  const base = path.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
  return base.length > 0 ? base : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Derive a 1-based page number from position.pageIndex or a numeric label. */
function pageOf(position: unknown, pageLabel: string): number | null {
  if (position && typeof position === 'object') {
    const pageIndex = (position as { pageIndex?: unknown }).pageIndex;
    if (typeof pageIndex === 'number' && Number.isFinite(pageIndex)) {
      return pageIndex + 1;
    }
  }
  // BBT normally parses annotationPosition to an object, but tolerate the
  // raw JSON string Zotero stores.
  if (typeof position === 'string') {
    try {
      const parsed = JSON.parse(position) as { pageIndex?: unknown };
      if (typeof parsed.pageIndex === 'number') return parsed.pageIndex + 1;
    } catch {
      // fall through to the page label
    }
  }
  // Accept a purely-numeric page label, including zero-padded forms like
  // "007" (a strict String(parseInt(x)) === x round-trip would reject those).
  // Roman numerals, "12a", and empty labels stay null so pageLabel carries them.
  const trimmed = pageLabel.trim();
  if (/^\d+$/.test(trimmed)) {
    const numericLabel = parseInt(trimmed, 10);
    if (Number.isFinite(numericLabel)) return numericLabel;
  }
  return null;
}

function tagsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object') {
        const tag = (t as { tag?: unknown }).tag;
        if (typeof tag === 'string') return tag;
      }
      return null;
    })
    .filter((t): t is string => t !== null);
}

/** Build the `zotero://open-pdf` deep link for an annotation. */
function buildOpenURI(
  attachmentOpen: string | null,
  page: number | null,
  annotationKey: string | null,
): string | null {
  // Only BBT's authoritative `open` URI carries the correct library scope
  // (personal `/library/items/` vs. group `/groups/<id>/items/`). When it is
  // absent we cannot know the scope, so we emit no deep link rather than a
  // fabricated `/library/items/<key>` that opens the wrong item for a group
  // library.
  const base = attachmentOpen;
  if (!base) return null;

  const params: string[] = [];
  if (page !== null) params.push(`page=${page}`);
  if (annotationKey) params.push(`annotation=${annotationKey}`);
  if (params.length === 0) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${params.join('&')}`;
}

/**
 * Map one raw Zotero annotation record (`annotationType`, `annotationText`,
 * `annotationPosition`, …) into the source-agnostic model. The field
 * vocabulary is identical between the BBT JSON-RPC payload (fields on the
 * annotation object itself) and the native local-API item (`item.data`), so
 * both adapters share this single mapping.
 */
export function mapZoteroAnnotation(
  fields: Record<string, unknown>,
  annotationKey: string | null,
  attachmentOpenURI: string | null,
): Annotation {
  const pageLabel = str(fields.annotationPageLabel);
  const page = pageOf(fields.annotationPosition, pageLabel);
  const color = str(fields.annotationColor);
  return {
    id: annotationKey,
    type: str(fields.annotationType),
    text: str(fields.annotationText),
    comment: str(fields.annotationComment),
    color,
    colorName: zoteroColorName(color),
    page,
    pageLabel,
    sortIndex: str(fields.annotationSortIndex),
    dateModified: strOrNull(fields.dateModified),
    tags: tagsOf(fields.tags),
    imagePath: strOrNull(fields.annotationImagePath),
    openURI: buildOpenURI(attachmentOpenURI, page, annotationKey),
    source: 'zotero',
  };
}

/**
 * Normalize the raw `item.attachments` JSON-RPC result for one citekey into
 * typed attachments and annotations. Malformed input yields empty arrays —
 * never an exception.
 */
export function normalizeZoteroAttachments(
  raw: unknown,
): NormalizedAttachments {
  const attachments: AttachmentRef[] = [];
  const annotations: Annotation[] = [];
  if (!Array.isArray(raw)) {
    return { attachments, annotations };
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const dto = item as Record<string, unknown>;
    const open = strOrNull(dto.open);
    const path = strOrNull(dto.path);
    const key = attachmentKeyOf(open, path);
    const rawAnnotations = Array.isArray(dto.annotations)
      ? dto.annotations
      : [];

    const normalized = rawAnnotations
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => mapZoteroAnnotation(a, strOrNull(a.key), open));

    // Document order: Zotero's sortIndex sorts by code unit (see
    // compareSortIndex — locale collation would reorder it).
    normalized.sort((a, b) => compareSortIndex(a.sortIndex, b.sortIndex));

    attachments.push({
      id: key,
      path,
      title: basenameWithoutExtension(path),
      openURI: open,
      annotationCount: normalized.length,
    });
    // Append one-by-one rather than `push(...normalized)`: spreading a very
    // large array as call arguments overflows the engine's argument limit and
    // throws RangeError, which would break the "never throws" contract for an
    // attachment carrying an extreme number of annotations.
    for (const annotation of normalized) annotations.push(annotation);
  }

  return { attachments, annotations };
}
