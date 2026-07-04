/**
 * Frontmatter parsing and three-way key merging for note sync.
 *
 * Ownership model: keys the template renders are plugin-owned; keys the user
 * added are user-owned and always preserved. Plugin-owned keys are merged
 * per key with three-way semantics against the stored baseline:
 *
 * - render == baseline, note differs   → user edited the value → keep note
 * - note == baseline, render differs   → library changed       → take render
 * - both changed to the same value     → fine                  → take either
 * - both changed differently           → conflict (surfaced for review)
 * - no baseline: equal values pass through; differing values conflict
 */

const FRONTMATTER_FENCE = '---';

/**
 * A top-level YAML mapping key line: `key:` with no leading whitespace.
 * Lines starting with `-` (list items) or `#` (comments) attach to the
 * preceding key.
 */
const TOP_LEVEL_KEY_RE = /^([^\s:#-][^:]*):(.*)$/;

/** Content split into frontmatter lines and body lines. */
export interface FrontmatterSplit {
  /** Frontmatter body lines (between the fences, exclusive). */
  frontmatter: string[];
  /** Everything after the closing fence. */
  body: string[];
  /** Whether a frontmatter block was found at the top of the content. */
  found: boolean;
}

/** Split content into frontmatter lines and body lines. */
export function splitFrontmatter(content: string): FrontmatterSplit {
  const lines = content.split('\n');
  if ((lines[0] ?? '').trimEnd() !== FRONTMATTER_FENCE) {
    return { frontmatter: [], body: lines, found: false };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === FRONTMATTER_FENCE) {
      return {
        frontmatter: lines.slice(1, i),
        body: lines.slice(i + 1),
        found: true,
      };
    }
  }
  // Unterminated fence: treat as no frontmatter.
  return { frontmatter: [], body: lines, found: false };
}

/** Frontmatter grouped into per-key blocks. */
export interface KeyBlocks {
  /** Key names in their original order. */
  order: string[];
  /** Key name → the lines that make up the key's block, `\n`-joined. */
  blocks: Map<string, string>;
}

/**
 * Group frontmatter lines into per-key blocks. A block is the `key: …` line
 * plus any following lines that are not themselves top-level keys (indented
 * continuations, `- item` list entries, blank lines, comments).
 */
export function parseKeyBlocks(lines: string[]): KeyBlocks {
  const order: string[] = [];
  const blocks = new Map<string, string[]>();
  let current: string[] | null = null;

  for (const line of lines) {
    const match = line.match(TOP_LEVEL_KEY_RE);
    if (match) {
      const key = match[1].trim();
      if (!blocks.has(key)) {
        current = [line];
        order.push(key);
        blocks.set(key, current);
      } else {
        // Duplicate key: append to the existing block so nothing is lost.
        current = blocks.get(key)!;
        current.push(line);
      }
    } else if (current) {
      current.push(line);
    }
    // Lines before the first key (comments) are dropped from key blocks but
    // re-emitted only for the render side, which controls layout.
  }

  const joined = new Map<string, string>();
  for (const [key, blockLines] of blocks) {
    // Trailing blank lines are cosmetic; trimming keeps comparisons stable.
    const copy = [...blockLines];
    while (copy.length > 0 && copy[copy.length - 1].trim() === '') copy.pop();
    joined.set(key, copy.join('\n'));
  }
  return { order, blocks: joined };
}

/** A frontmatter key whose plugin and user edits collide. */
export interface FrontmatterConflict {
  key: string;
  base: string | null;
  /** Key block as it is in the note right now. */
  ours: string;
  /** Key block as freshly rendered. */
  theirs: string;
}

/** Result of merging rendered frontmatter into the note's frontmatter. */
export interface FrontmatterSyncResult {
  /** Merged frontmatter lines with the default (keep-ours) conflict resolution. */
  lines: string[];
  /** Merged lines with conflicts resolved toward the fresh render. */
  linesTakeTheirs: string[];
  conflicts: FrontmatterConflict[];
  /** Plugin-owned keys whose values were refreshed from the render. */
  updatedKeys: string[];
  /** Key → rendered block, to store as the new baseline. */
  baseline: Record<string, string>;
}

/**
 * Merge rendered frontmatter into current frontmatter with per-key three-way
 * semantics (see module docs). User-only keys are appended after the
 * template-owned keys in their original order.
 */
export function syncFrontmatter(
  renderedFmLines: string[],
  currentFmLines: string[],
  baselineKeys: Record<string, string> | null,
): FrontmatterSyncResult {
  const rendered = parseKeyBlocks(renderedFmLines);
  const current = parseKeyBlocks(currentFmLines);

  const conflicts: FrontmatterConflict[] = [];
  const updatedKeys: string[] = [];
  const baseline: Record<string, string> = {};
  const ours: string[] = [];
  const theirsResolved: string[] = [];

  for (const key of rendered.order) {
    const renderBlock = rendered.blocks.get(key)!;
    baseline[key] = renderBlock;
    const currentBlock = current.blocks.get(key);
    const baseBlock = baselineKeys ? (baselineKeys[key] ?? null) : null;

    let chosen: string;
    if (currentBlock === undefined) {
      // Key not in the note (new key, or user deleted it). Baseline tells us
      // which: if the user deleted a key the plugin previously wrote, honour
      // the deletion; otherwise it is a brand-new key — add it.
      if (baseBlock !== null && baselineKeys && baseBlock === renderBlock) {
        continue; // user deleted, data unchanged → stay deleted
      }
      chosen = renderBlock;
      if (baseBlock !== renderBlock) updatedKeys.push(key);
    } else if (currentBlock === renderBlock) {
      chosen = currentBlock;
    } else if (baseBlock === null) {
      // No baseline knowledge — cannot tell user edit from data change.
      conflicts.push({
        key,
        base: null,
        ours: currentBlock,
        theirs: renderBlock,
      });
      chosen = currentBlock;
    } else if (renderBlock === baseBlock) {
      chosen = currentBlock; // user edited, data unchanged → keep user's value
    } else if (currentBlock === baseBlock) {
      chosen = renderBlock; // data changed, user didn't touch it → refresh
      updatedKeys.push(key);
    } else {
      conflicts.push({
        key,
        base: baseBlock,
        ours: currentBlock,
        theirs: renderBlock,
      });
      chosen = currentBlock;
    }

    ours.push(chosen);
    theirsResolved.push(
      conflicts.length > 0 && conflicts[conflicts.length - 1].key === key
        ? renderBlock
        : chosen,
    );
  }

  // User-only keys: never touched, appended in their original order.
  for (const key of current.order) {
    if (!rendered.blocks.has(key)) {
      const block = current.blocks.get(key)!;
      ours.push(block);
      theirsResolved.push(block);
    }
  }

  return {
    lines: ours.join('\n').split('\n'),
    linesTakeTheirs: theirsResolved.join('\n').split('\n'),
    conflicts,
    updatedKeys,
    baseline,
  };
}
