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

/**
 * Matches the ID line that terminates a sync block inside a callout:
 * `> ^zc-<name>` (leading quote marker, optional whitespace, trailing CR).
 */
const SYNC_BLOCK_ID_LINE_RE = /^>\s*\^zc-([A-Za-z0-9_-]+)\s*\r?$/;

/** Matches any callout/quote line (used to find the start of the block). */
const QUOTE_LINE_RE = /^>/;

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
 * A block is a contiguous run of `>`-prefixed lines whose last line is a
 * `> ^zc-<name>` ID line. Anything else — including callouts without a
 * plugin ID — is ignored (user-owned). Duplicate names keep the first
 * occurrence (later duplicates are ignored, never merged).
 */
export function parseSyncBlocks(content: string): Map<string, SyncBlock> {
  const lines = content.split('\n');
  const blocks = new Map<string, SyncBlock>();

  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(SYNC_BLOCK_ID_LINE_RE);
    if (!idMatch) continue;

    // Walk back to the start of the contiguous quote group.
    let start = i;
    while (start > 0 && QUOTE_LINE_RE.test(lines[start - 1])) {
      start--;
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
    .map((line) => (line.length > 0 ? `> ${line}` : '>'));

  const body = inner.trim().length > 0 ? innerLines : [];
  return [
    `> [!${type}]${fold} ${title}`.trimEnd(),
    ...body,
    `> ^zc-${name}`,
  ].join('\n');
}
