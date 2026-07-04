/**
 * Plugin-owned sync blocks: the ONLY body content the plugin ever manages.
 *
 * A sync block is a callout whose last line carries an Obsidian block ID with
 * the plugin prefix:
 *
 *   > [!cite]- Metadata
 *   > **Authors:** Smith, Jones
 *   > **Year:** 2023
 *   > ^zc-meta
 *
 * Ownership model (inverted relative to marker-based approaches): everything
 * WITHOUT a `^zc-…` block ID belongs to the user and is never touched by note
 * updates. The `^id` syntax is native Obsidian — the blocks stay linkable and
 * embeddable, and the ID is invisible in reading view.
 */

/** Prefix that marks a block ID as plugin-owned ("zc" = Zotero citations). */
export const SYNC_BLOCK_ID_PREFIX = 'zc-';

/** Valid sync-block names: letters, digits, underscore, dash. */
export const SYNC_BLOCK_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Escape a string for safe interpolation into a RegExp. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches the ID line that terminates a sync block inside a callout:
 * `> ^zc-<name>` (leading quote marker, optional whitespace, trailing CR).
 * Derived from {@link SYNC_BLOCK_ID_PREFIX} so the prefix has a single source
 * of truth (the builder below uses it too).
 */
const SYNC_BLOCK_ID_LINE_RE = new RegExp(
  `^ {0,3}>\\s*\\^${escapeRegExp(SYNC_BLOCK_ID_PREFIX)}([A-Za-z0-9_-]+)\\s*\\r?$`,
);

/**
 * Matches any callout/quote line. Markdown (and Obsidian) treat a `>` indented
 * by up to three spaces as a blockquote, so the parser must too — otherwise an
 * indented plugin block would be invisible and misclassified as user-deleted
 * (a permanent tombstone that silently stops all future updates).
 */
const QUOTE_LINE_RE = /^ {0,3}>/;

/**
 * Matches a callout header line (`> [!type]`, optional fold marker `-`/`+`).
 * A plugin sync block always starts with such a header (see {@link buildSyncBlock}),
 * so it is used to bound the block start precisely instead of greedily
 * absorbing preceding user callout lines.
 */
const CALLOUT_HEADER_RE = /^ {0,3}>\s*\[![^\]]+\][-+]?/;

/**
 * Inner content lines that would be misparsed once quoted with `> `: a line
 * starting with `[!…]` would read as a callout header (truncating the block
 * span), and a line starting with `^zc-` would read as a block terminator
 * (splitting the block and shadowing a real block of that name).
 * {@link buildSyncBlock} escapes them with a leading backslash, which Markdown
 * renders as the literal text the author wrote.
 */
const AMBIGUOUS_INNER_LINE_RE = /^(\s*)(\[!|\^zc-)/;

/** Type guard: is `name` a valid sync-block name? */
export function isValidSyncBlockName(name: unknown): name is string {
  return typeof name === 'string' && SYNC_BLOCK_NAME_RE.test(name);
}

/** A plugin-owned block found in note content. */
export interface SyncBlock {
  /** Block name without the `zc-` prefix. */
  name: string;
  /** Full block text (all callout lines including the ID line, `\n`-joined). */
  text: string;
  /** Index of the first line of the block within the content's line array. */
  startLine: number;
  /** Index of the last line (the ID line), inclusive. */
  endLine: number;
}

/**
 * Find every sync block in `content`.
 *
 * A block ends at a `> ^zc-<name>` ID line. Its start is bounded precisely so
 * it never absorbs neighbouring user content or an adjacent plugin block:
 *
 * 1. Walk back over the contiguous run of `>`-quoted lines, but STOP at a
 *    previous block's `^zc-…` ID line (so two adjacent plugin blocks stay
 *    separate).
 * 2. Within that run, the block starts at the LAST callout header (`> [!…]`)
 *    at or before the ID line. A user callout stacked directly above (with no
 *    blank separator) keeps its own earlier header and is therefore left
 *    untouched.
 *
 * Anything without a `^zc-…` ID is user-owned and ignored. Duplicate names
 * keep the first occurrence (later duplicates are ignored, never merged).
 */
export function parseSyncBlocks(content: string): Map<string, SyncBlock> {
  const lines = content.split('\n');
  const blocks = new Map<string, SyncBlock>();

  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(SYNC_BLOCK_ID_LINE_RE);
    if (!idMatch) continue;

    // (1) Extent of the contiguous quote run, stopping before a previous
    // block's ID line so adjacent plugin blocks do not merge.
    let runStart = i;
    while (
      runStart > 0 &&
      QUOTE_LINE_RE.test(lines[runStart - 1]) &&
      !SYNC_BLOCK_ID_LINE_RE.test(lines[runStart - 1])
    ) {
      runStart--;
    }

    // (2) The block begins at its own callout header — the last header line at
    // or before the ID line — never earlier, so a stacked user callout above
    // is not absorbed. Fall back to the run start if (unexpectedly) no header.
    let start = runStart;
    for (let j = i; j >= runStart; j--) {
      if (CALLOUT_HEADER_RE.test(lines[j])) {
        start = j;
        break;
      }
    }

    const name = idMatch[1];
    if (!blocks.has(name)) {
      blocks.set(name, {
        name,
        text: lines.slice(start, i + 1).join('\n'),
        startLine: start,
        endLine: i,
      });
    }
  }

  return blocks;
}

/** Quick check without building the full map. */
export function hasSyncBlocks(content: string): boolean {
  return content.split('\n').some((l) => SYNC_BLOCK_ID_LINE_RE.test(l));
}

/** Options for {@link buildSyncBlock}. */
export interface SyncBlockOptions {
  /** Callout type (`note`, `cite`, `quote`, custom, …). */
  type?: string;
  /** Callout title; defaults to the block name. */
  title?: string;
  /** Render the callout collapsed (`[!type]-`). */
  collapsed?: boolean;
}

/**
 * Build the callout text for a sync block from raw inner content.
 * Every inner line is quoted with `> ` and the plugin ID line is appended.
 */
export function buildSyncBlock(
  name: string,
  inner: string,
  options: SyncBlockOptions = {},
): string {
  const type = options.type ?? 'note';
  const title = options.title ?? name;
  const fold = options.collapsed ? '-' : '';

  const innerLines = inner
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .split('\n')
    // Escape content that would be misparsed as a callout header or a block
    // terminator once quoted (see AMBIGUOUS_INNER_LINE_RE) — otherwise such a
    // line corrupts the block's span on the next parse and every re-sync
    // duplicates or truncates the block.
    .map((line) => line.replace(AMBIGUOUS_INNER_LINE_RE, '$1\\$2'))
    .map((line) => (line.length > 0 ? `> ${line}` : '>'));

  const body = inner.trim().length > 0 ? innerLines : [];
  return [
    `> [!${type}]${fold} ${title}`.trimEnd(),
    ...body,
    `> ^${SYNC_BLOCK_ID_PREFIX}${name}`,
  ].join('\n');
}
