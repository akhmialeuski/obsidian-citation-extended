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
 * Extract every distinct citekey referenced anywhere in a block of text,
 * preserving first-occurrence order. Recognizes the same forms as
 * {@link extractCitekeyAtCursor} — `[[@key]]`, `[@key]` (including multi-cite
 * groups like `[@a; @b]`), and bare `@key` — across the whole document.
 *
 * Pure function with no editor dependency, so it can scan file contents read
 * from the vault as well as live editor text.
 */
export function extractCitekeysFromText(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const add = (key: string): void => {
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  };

  // Wiki-style links: [[@key]] or [[@key|alias]]
  const wikiRe = /\[\[@([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wikiRe.exec(text)) !== null) {
    add(m[1].trim());
  }

  // Pandoc groups: [@a; @b, p. 3] — expand each citekey in the group.
  const groupRe = /\[([^\]]*@[^\]]*)\]/g;
  while ((m = groupRe.exec(text)) !== null) {
    const body = m[1];
    GROUP_CITEKEY_RE.lastIndex = 0;
    let inner: RegExpExecArray | null;
    while ((inner = GROUP_CITEKEY_RE.exec(body)) !== null) {
      add(inner[1]);
    }
  }

  // Bare citekeys: @key not preceded by `[` (those are handled above) or by a
  // word character (avoids matching e-mail addresses like name@example.com).
  const bareRe = /(?:^|[^[\w@])@([\w:.#$%&\-+?<>~/]+)/g;
  while ((m = bareRe.exec(text)) !== null) {
    add(m[1]);
  }

  return ordered;
}
