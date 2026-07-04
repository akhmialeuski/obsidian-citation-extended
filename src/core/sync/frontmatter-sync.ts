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
 *
 * The reconstruction preserves the note's ACTUAL frontmatter layout: the
 * prelude (comments / blank lines before the first key), key order, and each
 * kept key's exact formatting are emitted verbatim. Only plugin-owned key
 * values are refreshed, and only genuinely new plugin keys are appended.
 */

const FRONTMATTER_FENCE = '---';

/**
 * A top-level YAML mapping key line: `key:` with no leading whitespace.
 * Lines starting with `-` (list items), `#` (comments) or whitespace attach to
 * the preceding key (or the prelude when no key has been seen yet).
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

/** Frontmatter grouped into per-key blocks, preserving layout. */
export interface KeyBlocks {
  /** Lines before the first top-level key (comments, blank lines). */
  prelude: string[];
  /** Key names in their original order. */
  order: string[];
  /** Key name → the key's block lines exactly as written (`\n`-joined). */
  raw: Map<string, string>;
  /**
   * Key name → normalized block (trailing blank lines trimmed) used ONLY for
   * equality decisions, so cosmetic trailing whitespace never flips a merge.
   */
  norm: Map<string, string>;
}

/** Trim trailing blank lines from a block (comparison-only normalization). */
function normalizeBlock(blockLines: string[]): string {
  const copy = [...blockLines];
  while (copy.length > 0 && copy[copy.length - 1].trim() === '') copy.pop();
  return copy.join('\n');
}

/**
 * Group frontmatter lines into per-key blocks. A block is the `key: …` line
 * plus any following lines that are not themselves top-level keys (indented
 * continuations, `- item` list entries, blank lines, comments). Lines before
 * the first key are kept in {@link KeyBlocks.prelude}.
 */
export function parseKeyBlocks(lines: string[]): KeyBlocks {
  const prelude: string[] = [];
  const order: string[] = [];
  const rawLines = new Map<string, string[]>();
  let current: string[] | null = null;

  for (const line of lines) {
    const match = line.match(TOP_LEVEL_KEY_RE);
    if (match) {
      const key = match[1].trim();
      if (!rawLines.has(key)) {
        current = [line];
        order.push(key);
        rawLines.set(key, current);
      } else {
        // Duplicate key: append to the existing block so nothing is lost.
        current = rawLines.get(key)!;
        current.push(line);
      }
    } else if (current) {
      current.push(line);
    } else {
      // Before the first key: preserve verbatim (comments, blank lines).
      prelude.push(line);
    }
  }

  const raw = new Map<string, string>();
  const norm = new Map<string, string>();
  for (const [key, blockLines] of rawLines) {
    raw.set(key, blockLines.join('\n'));
    norm.set(key, normalizeBlock(blockLines));
  }
  return { prelude, order, raw, norm };
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
  /** Key → normalized rendered block, to store as the new baseline. */
  baseline: Record<string, string>;
  /** Plugin-owned keys the user deleted — recorded so they stay deleted. */
  deletedKeys: string[];
}

/** Per-key resolution for the two output variants. */
interface KeyResolution {
  ours: string;
  theirs: string;
}

/**
 * Merge rendered frontmatter into current frontmatter with per-key three-way
 * semantics (see module docs). The note's layout is preserved: prelude and
 * kept keys are emitted verbatim, only plugin key values change, and new
 * plugin keys are appended in render order.
 *
 * @param baselineDeletedKeys Plugin keys the user previously deleted (tombstone).
 */
export function syncFrontmatter(
  renderedFmLines: string[],
  currentFmLines: string[],
  baselineKeys: Record<string, string> | null,
  baselineDeletedKeys: readonly string[] = [],
): FrontmatterSyncResult {
  const rendered = parseKeyBlocks(renderedFmLines);
  const current = parseKeyBlocks(currentFmLines);
  const tombstoned = new Set(baselineDeletedKeys);

  const conflicts: FrontmatterConflict[] = [];
  const updatedKeys: string[] = [];
  const baseline: Record<string, string> = {};
  const deletedKeys: string[] = [];
  /** Chosen output blocks per plugin key, keyed by name. */
  const resolutions = new Map<string, KeyResolution>();

  for (const key of rendered.order) {
    const renderRaw = rendered.raw.get(key)!;
    const renderNorm = rendered.norm.get(key)!;
    baseline[key] = renderNorm;
    const currentRaw = current.raw.get(key);
    const currentNorm = current.norm.get(key);
    const baseNorm = baselineKeys ? (baselineKeys[key] ?? null) : null;

    if (currentNorm === undefined) {
      // Key absent from the note. Respect a deletion the same way blocks do:
      // if the plugin previously wrote this key (baseline had it) or it is
      // tombstoned, the user removed it — keep it removed unconditionally,
      // regardless of whether the library value changed.
      if (baseNorm !== null || tombstoned.has(key)) {
        deletedKeys.push(key);
        delete baseline[key];
      } else {
        // Brand-new plugin key → add it.
        resolutions.set(key, { ours: renderRaw, theirs: renderRaw });
        updatedKeys.push(key);
      }
      continue;
    }

    if (currentNorm === renderNorm) {
      resolutions.set(key, { ours: currentRaw!, theirs: currentRaw! });
    } else if (baseNorm === null) {
      // No baseline knowledge — cannot tell user edit from data change.
      conflicts.push({
        key,
        base: null,
        ours: currentRaw!,
        theirs: renderRaw,
      });
      resolutions.set(key, { ours: currentRaw!, theirs: renderRaw });
    } else if (renderNorm === baseNorm) {
      // User edited, data unchanged → keep the user's value.
      resolutions.set(key, { ours: currentRaw!, theirs: currentRaw! });
    } else if (currentNorm === baseNorm) {
      // Data changed, user didn't touch it → refresh.
      resolutions.set(key, { ours: renderRaw, theirs: renderRaw });
      updatedKeys.push(key);
    } else {
      // Both sides changed differently → conflict.
      conflicts.push({
        key,
        base: baseNorm,
        ours: currentRaw!,
        theirs: renderRaw,
      });
      resolutions.set(key, { ours: currentRaw!, theirs: renderRaw });
    }
  }

  const emit = (side: 'ours' | 'theirs'): string[] => {
    const out: string[] = [...current.prelude];
    // Walk the note's own key order, preserving user keys and layout.
    for (const key of current.order) {
      const res = resolutions.get(key);
      if (res) {
        out.push(res[side]);
      } else {
        // User-only key (not plugin-owned) — emit verbatim.
        out.push(current.raw.get(key)!);
      }
    }
    // Append genuinely new plugin keys (present in render, absent from note)
    // in render order.
    for (const key of rendered.order) {
      if (!current.raw.has(key) && resolutions.has(key)) {
        out.push(resolutions.get(key)![side]);
      }
    }
    return out.join('\n').split('\n');
  };

  const lines = emit('ours');
  const linesTakeTheirs = conflicts.length > 0 ? emit('theirs') : lines;

  return {
    lines,
    linesTakeTheirs,
    conflicts,
    updatedKeys,
    baseline,
    deletedKeys,
  };
}
