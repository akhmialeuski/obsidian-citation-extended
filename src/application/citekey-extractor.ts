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
