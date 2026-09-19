import type { IEditorProxy } from '../platform/platform-adapter';

/**
 * Regex patterns to detect a citation citekey at the cursor position.
 * Matches: [[@citekey]], [[@citekey|alias]], [@citekey], standalone @citekey
 */
const CITEKEY_PATTERNS = [
  /\[\[@([^\]|]+)(?:\|[^\]]+)?\]\]/g,
  /\[@([^\]]+)\]/g,
  /(?:^|[^[])@([\w:.#$%&\-+?<>~/]+)/g,
];

/**
 * Extract a citekey from the text surrounding the cursor position.
 * Scans the current line for known citation patterns.
 *
 * Pure function — depends only on the editor proxy interface.
 */
export function extractCitekeyAtCursor(editor: IEditorProxy): string | null {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);
  const ch = cursor.ch;

  for (const pattern of CITEKEY_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (ch >= start && ch <= end) {
        return match[1];
      }
    }
  }
  return null;
}

/**
 * Splits a Pandoc citation group body (the text inside `[...]`) into the
 * individual citekeys it references, e.g. `@a; @b, p. 3` → `['a', 'b']`.
 */
const GROUP_CITEKEY_RE = /@([\w:.#$%&\-+?<>~/]+)/g;

/**
 * Single token scanner recognizing every citation form, tried in this order at
 * each position so the most specific wins: wiki link `[[@key]]` (capture 1),
 * Pandoc bracket group `[@a; @b]` (capture 2 = body), then a bare `@key`
 * (capture 3). The bare alternative requires a non-`[`, non-word, non-`@`
 * boundary so it neither re-matches inside a bracket group nor fires inside an
 * e-mail address (`name@example.com`).
 */
const CITEKEY_TOKEN_RE =
  /\[\[@([^\]|]+)(?:\|[^\]]+)?\]\]|\[([^\]]*@[^\]]*)\]|(?:^|[^[\w@])@([\w:.#$%&\-+?<>~/]+)/g;

/**
 * Extract every distinct citekey referenced anywhere in a block of text,
 * preserving first-occurrence order. Recognizes the same forms as
 * {@link extractCitekeyAtCursor} — `[[@key]]`, `[@key]` (including multi-cite
 * groups like `[@a; @b]`), and bare `@key` — across the whole document.
 *
 * A single left-to-right scan keeps the result in true document order (rather
 * than grouping by citation syntax), which is the order the references panel
 * relies on.
 *
 * Pure function with no editor dependency, so it can scan file contents read
 * from the vault as well as live editor text.
 */
export function extractCitekeysFromText(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const add = (key: string): void => {
    const trimmed = key.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      ordered.push(trimmed);
    }
  };

  CITEKEY_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITEKEY_TOKEN_RE.exec(text)) !== null) {
    if (m[1] !== undefined) {
      // Wiki link `[[@key]]`.
      add(m[1]);
    } else if (m[2] !== undefined) {
      // Pandoc group `[@a; @b]` — expand each citekey in the body, in order.
      GROUP_CITEKEY_RE.lastIndex = 0;
      let inner: RegExpExecArray | null;
      while ((inner = GROUP_CITEKEY_RE.exec(m[2])) !== null) {
        add(inner[1]);
      }
    } else if (m[3] !== undefined) {
      // Bare `@key`.
      add(m[3]);
    }
  }

  return ordered;
}

/** Character offsets of one citation token within a block of text. */
export interface CitekeyOccurrence {
  /** Offset of the leading `@`, or of the citekey itself when there is none. */
  readonly start: number;
  /** Offset one past the last character of the citekey. */
  readonly end: number;
}

/**
 * Extend a span left over an immediately preceding `@` so the reported range
 * covers the citation token the user sees (`@smith2020`), not just the key.
 */
function spanFromKeyStart(
  text: string,
  keyStart: number,
  keyLength: number,
): CitekeyOccurrence {
  const start = text[keyStart - 1] === '@' ? keyStart - 1 : keyStart;
  return { start, end: keyStart + keyLength };
}

/**
 * Locate every occurrence of one citekey in `text`, in document order.
 *
 * Runs the same {@link CITEKEY_TOKEN_RE} scan as
 * {@link extractCitekeysFromText}, so what the references panel lists and what
 * this resolves to can never drift apart: a citekey the panel shows always has
 * at least one occurrence here, in every form the panel recognizes —
 * `[[@key]]`, `[[@key|alias]]`, a Pandoc group member in `[@a; @b]`, or a bare
 * `@key`. Inside a group, only the matching key's own span is reported, not the
 * whole bracket.
 *
 * Pure function over text, so callers can feed it live editor content or a
 * file read from the vault.
 */
export function findCitekeyOccurrences(
  text: string,
  citekey: string,
): CitekeyOccurrence[] {
  const target = citekey.trim();
  if (!target) return [];

  const occurrences: CitekeyOccurrence[] = [];

  CITEKEY_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITEKEY_TOKEN_RE.exec(text)) !== null) {
    if (m[1] !== undefined) {
      // Wiki link `[[@key]]` — the raw key starts right after the `[[@`, and
      // extractCitekeysFromText trims it, so skip the same leading blanks.
      if (m[1].trim() !== target) continue;
      const leading = m[1].length - m[1].trimStart().length;
      occurrences.push(
        spanFromKeyStart(text, m.index + 3 + leading, target.length),
      );
    } else if (m[2] !== undefined) {
      // Pandoc group `[@a; @b]` — the body starts one char past the `[`.
      const bodyStart = m.index + 1;
      GROUP_CITEKEY_RE.lastIndex = 0;
      let inner: RegExpExecArray | null;
      while ((inner = GROUP_CITEKEY_RE.exec(m[2])) !== null) {
        if (inner[1] !== target) continue;
        // inner.index points at the `@`; the key follows it.
        occurrences.push(
          spanFromKeyStart(text, bodyStart + inner.index + 1, target.length),
        );
      }
    } else if (m[3] !== undefined) {
      // Bare `@key` — the match may carry a leading boundary character.
      if (m[3] !== target) continue;
      occurrences.push(
        spanFromKeyStart(
          text,
          m.index + m[0].length - target.length,
          target.length,
        ),
      );
    }
  }

  return occurrences;
}
