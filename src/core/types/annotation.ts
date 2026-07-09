/**
 * Source-agnostic annotation model.
 *
 * Every data source that carries annotation-like data (Zotero PDF
 * annotations, Readwise highlights, …) normalizes it into these shapes, and
 * {@link Entry} exposes them uniformly via `entry.annotations` /
 * `entry.attachments`. Consumers (templates, the notes layer) never touch a
 * source-specific type or fetch from a database directly — they read this one
 * interface. A source with no annotations simply yields an empty array, so
 * templates guard with `{{#if annotationCount}}` and skip.
 *
 * Adding a future source means implementing the mapping into these types; it
 * requires no new field on the consumer side.
 */

/** A single normalized annotation (highlight, comment, image region, …). */
export interface Annotation {
  /** Stable per-source id (used in deep links), or null. */
  id: string | null;
  /**
   * Annotation kind as reported by the source: `highlight`, `underline`,
   * `note`, `image`, `ink`, `text`, … Not an enum — sources may use their own
   * vocabulary; templates that care can match on it.
   */
  type: string;
  /** Highlighted/quoted text. Empty for note- and image-only annotations. */
  text: string;
  /** The user's comment/note on the annotation, or ''. */
  comment: string;
  /** Raw color (hex like `#ffd400`, or a source-native token), or ''. */
  color: string;
  /** Human-friendly palette name (yellow/red/…), or null when unknown. */
  colorName: string | null;
  /** 1-based page number when derivable, else null. */
  page: number | null;
  /** Page label as shown in the reader (may be roman numerals etc.), or ''. */
  pageLabel: string;
  /** Tag names attached to the annotation. */
  tags: string[];
  /** Absolute path to a cached image (image/area annotations), or null. */
  imagePath: string | null;
  /** Link that opens the source at this annotation, or null. */
  openURI: string | null;
  /** Opaque sort key; lexicographic order == document/reading order. */
  sortIndex: string;
  /** ISO timestamp of the last modification, or null. */
  dateModified: string | null;
  /** Which source produced it: `zotero`, `readwise`, … */
  source: string;
}

/** A normalized reference to a source attachment (e.g. a PDF file). */
export interface AttachmentRef {
  /** Per-source attachment id, or null. */
  id: string | null;
  /** Absolute file path, or null. */
  path: string | null;
  /** Display title (usually the file basename without extension), or null. */
  title: string | null;
  /** Link that opens the attachment in the source, or null. */
  openURI: string | null;
  /** Number of annotations found on this attachment. */
  annotationCount: number;
}
