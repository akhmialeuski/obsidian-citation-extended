/**
 * Note sync planner — decides, for one literature note, what an update may
 * change and what needs the user's eyes.
 *
 * Combines three ideas:
 *
 * 1. **Inverted ownership** — the plugin only ever touches (a) frontmatter
 *    keys its template renders and (b) callout blocks carrying `^zc-…` IDs
 *    (see {@link parseSyncBlocks}). Everything else in the note is
 *    user-owned and copied through byte-for-byte.
 * 2. **Three-way merge** — a baseline snapshot of the last render lets the
 *    planner distinguish "library changed" from "user edited": non-overlapping
 *    changes merge automatically (git-style, via diff3), overlapping ones
 *    become conflicts instead of silent overwrites.
 * 3. **Review-friendly output** — the plan carries both a safe default
 *    resolution (keep the user's version wherever in doubt) and a
 *    take-the-library-version alternative, so a UI can offer a real choice.
 *
 * The planner is pure: no I/O, fully unit-testable.
 */

import { mergeText } from './merge3';
import { parseSyncBlocks, SyncBlock } from './sync-blocks';
import {
  splitFrontmatter,
  syncFrontmatter,
  FrontmatterConflict,
} from './frontmatter-sync';
import type { NoteUpdateMode } from './note-update-mode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Snapshot of what the plugin last wrote into a note. */
export interface NoteBaseline {
  /** Plugin-owned frontmatter keys → normalized rendered key block. */
  frontmatter: Record<string, string>;
  /** Sync block name → full rendered block text. */
  blocks: Record<string, string>;
  /** Block names the user deleted from the note — never re-appended. */
  deletedBlocks?: string[];
  /** Frontmatter keys the user deleted — never re-added. */
  deletedKeys?: string[];
  /**
   * Vault path of the note this snapshot was recorded against (stamped by
   * the baseline store). A citekey can resolve to a DIFFERENT file later
   * (renamed note, changed title template/folder) — merging that file
   * against a foreign baseline would misread its content as user edits or
   * silently overwrite it, so a path mismatch must degrade to "no baseline"
   * (first-sync semantics). Absent in stores written before this field.
   */
  path?: string;
}

/** One unit (block or frontmatter key) where both sides changed. */
export interface SyncConflict {
  kind: 'block' | 'frontmatter';
  /** Block name or frontmatter key. */
  id: string;
  base: string | null;
  /** The note's current version of the unit. */
  ours: string;
  /** The freshly rendered version ('' when the render dropped the unit). */
  theirs: string;
}

/** Per-category change summary for reporting. */
export interface SyncSummary {
  blocksReplaced: string[];
  blocksMerged: string[];
  blocksAppended: string[];
  blocksRemoved: string[];
  blocksDeletedByUser: string[];
  frontmatterKeysUpdated: string[];
}

/** The full plan for updating one note. */
export interface NoteSyncPlan {
  /** True when `content` differs from the current note. */
  changed: boolean;
  /**
   * Merged note content with the SAFE default resolution: wherever plugin
   * and user edits collide, the user's version is kept.
   */
  content: string;
  /**
   * Alternative content with conflicts resolved toward the fresh render.
   * Equals `content` when there are no conflicts.
   */
  contentTakeTheirs: string;
  conflicts: SyncConflict[];
  /** Baseline to persist after `content` (or the alternative) is written. */
  baseline: NoteBaseline;
  summary: SyncSummary;
}

/** Inputs to {@link planNoteSync}. */
export interface NoteSyncInput {
  /** Fresh template render. */
  rendered: string;
  /** The note as it currently exists in the vault. */
  current: string;
  /** Stored baseline from the previous sync, or null on first sync. */
  baseline: NoteBaseline | null;
  /**
   * Update mode. Defaults to `sync`. `frontmatter` leaves the body untouched;
   * `overwrite` replaces the whole note with the render.
   */
  mode?: NoteUpdateMode;
}

// ---------------------------------------------------------------------------
// Line-ending normalization
// ---------------------------------------------------------------------------

/**
 * Normalize CRLF / lone CR to LF. All sync comparisons are LF-based (the
 * render and stored baseline are always LF), so a CRLF note read from disk
 * would otherwise never equal its baseline and every unit would look changed.
 * Normalizing here means an updated note is rewritten with LF endings —
 * consistent with how Obsidian saves its own edits.
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

/** Internal alias — the planner normalizes both inputs at its boundary. */
const toLf = normalizeLineEndings;

// ---------------------------------------------------------------------------
// Baseline from a render
// ---------------------------------------------------------------------------

/** Empty change summary. */
function emptySummary(): SyncSummary {
  return {
    blocksReplaced: [],
    blocksMerged: [],
    blocksAppended: [],
    blocksRemoved: [],
    blocksDeletedByUser: [],
    frontmatterKeysUpdated: [],
  };
}

/**
 * Derive the baseline that a freshly rendered note establishes: the normalized
 * plugin-owned frontmatter keys plus the sync blocks. Shared by the planner's
 * overwrite path and {@link ../../notes/baseline-store} so the baseline shape
 * has a single definition.
 */
export function baselineFromRender(rendered: string): NoteBaseline {
  const normalized = toLf(rendered);
  const { frontmatter } = splitFrontmatter(normalized);
  const fm = syncFrontmatter(frontmatter, [], null);
  const blocks: Record<string, string> = {};
  for (const [name, block] of parseSyncBlocks(normalized)) {
    blocks[name] = block.text;
  }
  return { frontmatter: fm.baseline, blocks };
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Own-property lookup on a JSON-deserialized block map. A sync-block name that
 * matches an `Object.prototype` member (e.g. `toString`) must not read back the
 * inherited function — that would make baseText a non-string and either crash
 * the merge or misclassify the block.
 */
function ownBaseText(
  blocks: Record<string, string> | null | undefined,
  name: string,
): string | null {
  return blocks && Object.prototype.hasOwnProperty.call(blocks, name)
    ? blocks[name]
    : null;
}

interface BlockResolution {
  /** Chosen text for the safe (keep-ours) variant, or null to drop. */
  ours: string | null;
  /** Chosen text for the take-theirs variant, or null to drop. */
  theirs: string | null;
}

/** Compute the update plan for a single note. Pure function. */
export function planNoteSync(input: NoteSyncInput): NoteSyncPlan {
  const renderedRaw = toLf(input.rendered);
  const currentRaw = toLf(input.current);
  const mode: NoteUpdateMode = input.mode ?? 'sync';

  // --- Overwrite: wholesale replace, baseline derived from the render ---
  if (mode === 'overwrite') {
    return {
      changed: renderedRaw !== currentRaw,
      content: renderedRaw,
      contentTakeTheirs: renderedRaw,
      conflicts: [],
      baseline: baselineFromRender(renderedRaw),
      summary: emptySummary(),
    };
  }

  const rendered = splitFrontmatter(renderedRaw);
  const current = splitFrontmatter(currentRaw);

  const conflicts: SyncConflict[] = [];
  const summary = emptySummary();

  // --- Frontmatter -----------------------------------------------------
  const fm = syncFrontmatter(
    rendered.frontmatter,
    current.frontmatter,
    input.baseline ? input.baseline.frontmatter : null,
    input.baseline?.deletedKeys ?? [],
  );
  summary.frontmatterKeysUpdated = fm.updatedKeys;
  for (const c of fm.conflicts) {
    conflicts.push(toConflict(c));
  }

  // --- Body blocks -------------------------------------------------------
  const currentBody = current.body.join('\n');
  let bodyOurs = currentBody;
  const baselineOut: NoteBaseline = {
    frontmatter: fm.baseline,
    blocks: {},
    deletedBlocks: [],
    deletedKeys: fm.deletedKeys,
  };
  let hasBlockConflict = false;
  let currentBlocks = new Map<string, SyncBlock>();
  let resolutions = new Map<string, BlockResolution>();
  let appends: string[] = [];

  if (mode === 'sync') {
    const renderedBlocks = parseSyncBlocks(renderedRaw);
    currentBlocks = parseSyncBlocks(currentBody);
    const baseBlocks = input.baseline?.blocks ?? null;
    const previouslyDeleted = new Set(input.baseline?.deletedBlocks ?? []);
    resolutions = new Map<string, BlockResolution>();
    appends = [];

    for (const [name, renderBlock] of renderedBlocks) {
      baselineOut.blocks[name] = renderBlock.text;
      const currentBlock = currentBlocks.get(name);
      const baseText = ownBaseText(baseBlocks, name);

      if (!currentBlock) {
        // Not in the note. Respect a user deletion (known from the baseline
        // or the tombstone list); otherwise it is new content — append it.
        if (previouslyDeleted.has(name) || baseText !== null) {
          summary.blocksDeletedByUser.push(name);
          baselineOut.deletedBlocks!.push(name);
          delete baselineOut.blocks[name];
        } else {
          appends.push(renderBlock.text);
          summary.blocksAppended.push(name);
        }
        continue;
      }

      const res = resolveBlock(name, currentBlock, renderBlock.text, baseText, {
        conflicts,
        summary,
      });
      if (res.ours !== res.theirs) hasBlockConflict = true;
      resolutions.set(name, res);
    }

    // Blocks the render no longer produces (e.g. annotation deleted in the
    // library): pristine ones are removed, edited ones are conflicts.
    for (const [name, currentBlock] of currentBlocks) {
      if (renderedBlocks.has(name)) continue;
      const baseText = ownBaseText(baseBlocks, name);
      if (baseText === null) {
        // Unknown plugin-style block (perhaps from another tool or a renamed
        // template section) — leave it strictly alone.
        continue;
      }
      if (currentBlock.text === baseText) {
        resolutions.set(name, { ours: null, theirs: null });
        summary.blocksRemoved.push(name);
      } else {
        conflicts.push({
          kind: 'block',
          id: name,
          base: baseText,
          ours: currentBlock.text,
          theirs: '',
        });
        resolutions.set(name, { ours: currentBlock.text, theirs: null });
        hasBlockConflict = true;
      }
    }

    // Carry tombstones forward for blocks the render omitted THIS time (e.g.
    // a template conditional is temporarily false). Without this, one sync
    // cycle without the block in the render drops the tombstone, and the next
    // cycle that renders it re-appends content the user deliberately deleted.
    // A tombstoned name present in the note again means the user re-added it —
    // then the tombstone is intentionally released.
    for (const name of previouslyDeleted) {
      if (!renderedBlocks.has(name) && !currentBlocks.has(name)) {
        baselineOut.deletedBlocks!.push(name);
      }
    }

    bodyOurs = spliceBlocks(currentBody, currentBlocks, resolutions, 'ours');
    if (appends.length > 0) {
      bodyOurs = appendBlocks(bodyOurs, appends);
    }
  } else {
    // Frontmatter-only mode: carry the previous body baseline forward so
    // switching modes later keeps deletion detection intact.
    baselineOut.blocks = input.baseline?.blocks ?? {};
    baselineOut.deletedBlocks = input.baseline?.deletedBlocks ?? [];
  }

  if (baselineOut.deletedBlocks!.length === 0) delete baselineOut.deletedBlocks;
  if (baselineOut.deletedKeys!.length === 0) delete baselineOut.deletedKeys;

  // --- Assembly ----------------------------------------------------------
  const hasFm = rendered.found || current.found;
  const content = assemble(fm.lines, hasFm, bodyOurs);

  // The take-theirs variant only differs when there are conflicts; recompute
  // the body's theirs side only when a BLOCK conflict actually diverges.
  let contentTakeTheirs = content;
  if (conflicts.length > 0) {
    const bodyTheirs = hasBlockConflict
      ? appendBlocks(
          spliceBlocks(currentBody, currentBlocks, resolutions, 'theirs'),
          appends,
        )
      : bodyOurs;
    contentTakeTheirs = assemble(fm.linesTakeTheirs, hasFm, bodyTheirs);
  }

  return {
    changed: content !== currentRaw,
    content,
    contentTakeTheirs,
    conflicts,
    baseline: baselineOut,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toConflict(c: FrontmatterConflict): SyncConflict {
  return {
    kind: 'frontmatter',
    id: c.key,
    base: c.base,
    ours: c.ours,
    theirs: c.theirs,
  };
}

/** Decide what a block that exists in both note and render becomes. */
function resolveBlock(
  name: string,
  currentBlock: SyncBlock,
  renderText: string,
  baseText: string | null,
  out: { conflicts: SyncConflict[]; summary: SyncSummary },
): BlockResolution {
  const currentText = currentBlock.text;

  if (currentText === renderText) {
    return { ours: currentText, theirs: currentText };
  }
  if (baseText === null) {
    // First sync of a pre-existing note: cannot tell user edits from data
    // changes — surface it instead of guessing.
    out.conflicts.push({
      kind: 'block',
      id: name,
      base: null,
      ours: currentText,
      theirs: renderText,
    });
    return { ours: currentText, theirs: renderText };
  }
  if (renderText === baseText) {
    // Library unchanged; the difference is the user's edit — keep it.
    return { ours: currentText, theirs: currentText };
  }
  if (currentText === baseText) {
    // User didn't touch it; take the fresh render.
    out.summary.blocksReplaced.push(name);
    return { ours: renderText, theirs: renderText };
  }
  // Both sides changed: try a line-level three-way merge.
  const merged = mergeText(baseText, currentText, renderText);
  if (merged.ok) {
    out.summary.blocksMerged.push(name);
    return { ours: merged.merged, theirs: merged.merged };
  }
  out.conflicts.push({
    kind: 'block',
    id: name,
    base: baseText,
    ours: currentText,
    theirs: renderText,
  });
  return { ours: currentText, theirs: renderText };
}

/** Rebuild the body, swapping resolved block spans in place. */
function spliceBlocks(
  body: string,
  currentBlocks: Map<string, SyncBlock>,
  resolutions: Map<string, BlockResolution>,
  side: 'ours' | 'theirs',
): string {
  if (resolutions.size === 0) return body;
  const lines = body.split('\n');
  const out: string[] = [];
  // Map line index → block for O(1) lookup of span starts. Starts are distinct
  // (parseSyncBlocks bounds each block to its own callout header), so no
  // collision between adjacent blocks.
  const startToBlock = new Map<number, SyncBlock>();
  for (const block of currentBlocks.values()) {
    if (resolutions.has(block.name)) startToBlock.set(block.startLine, block);
  }

  let i = 0;
  while (i < lines.length) {
    const block = startToBlock.get(i);
    if (!block) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const replacement = resolutions.get(block.name)![side];
    i = block.endLine + 1;
    if (replacement !== null) {
      out.push(replacement);
    } else if (lines[i] === '') {
      // Block removed: also swallow ONE following blank line so deletions
      // don't accumulate empty gaps.
      i++;
    }
  }
  return out.join('\n');
}

/** Append new blocks at the end of the body, separated by blank lines. */
function appendBlocks(body: string, blocks: string[]): string {
  if (blocks.length === 0) return body;
  const trimmed = body.replace(/\n+$/, '');
  const parts = trimmed.length > 0 ? [trimmed] : [];
  parts.push(...blocks);
  return `${parts.join('\n\n')}\n`;
}

/** Reattach frontmatter to a body. */
function assemble(
  fmLines: string[],
  hasFrontmatter: boolean,
  body: string,
): string {
  const cleanedFm = fmLines.join('\n').split('\n');
  const fmEmpty = cleanedFm.every((l) => l.trim() === '');
  if (!hasFrontmatter || fmEmpty) return body;
  return ['---', ...cleanedFm, '---', ...body.split('\n')].join('\n');
}
