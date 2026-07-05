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

function basenameWithoutExtension(path: unknown): string | null {
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
  const numericLabel = parseInt(pageLabel, 10);
  return Number.isFinite(numericLabel) && String(numericLabel) === pageLabel
    ? numericLabel
    : null;
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
  attachmentKey: string | null,
  page: number | null,
  annotationKey: string | null,
): string | null {
  const base =
    attachmentOpen ??
    (attachmentKey ? `zotero://open-pdf/library/items/${attachmentKey}` : null);
  if (!base) return null;

  const params: string[] = [];
  if (page !== null) params.push(`page=${page}`);
  if (annotationKey) params.push(`annotation=${annotationKey}`);
  if (params.length === 0) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${params.join('&')}`;
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
      .map((a) => {
        const pageLabel = str(a.annotationPageLabel);
        const page = pageOf(a.annotationPosition, pageLabel);
        const annotationKey = strOrNull(a.key);
        const color = str(a.annotationColor);
        return {
          id: annotationKey,
          type: str(a.annotationType),
          text: str(a.annotationText),
          comment: str(a.annotationComment),
          color,
          colorName: zoteroColorName(color),
          page,
          pageLabel,
          sortIndex: str(a.annotationSortIndex),
          dateModified: strOrNull(a.dateModified),
          tags: tagsOf(a.tags),
          imagePath: strOrNull(a.annotationImagePath),
          openURI: buildOpenURI(open, key, page, annotationKey),
          source: 'zotero',
        } satisfies Annotation;
      });

    // Document order: Zotero's sortIndex is zero-padded, so a plain
    // lexicographic comparison equals reading order.
    normalized.sort((a, b) => a.sortIndex.localeCompare(b.sortIndex));

    attachments.push({
      id: key,
      path,
      title: basenameWithoutExtension(path),
      openURI: open,
      annotationCount: normalized.length,
    });
    annotations.push(...normalized);
  }

  return { attachments, annotations };
}
