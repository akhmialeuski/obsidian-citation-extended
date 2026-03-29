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
