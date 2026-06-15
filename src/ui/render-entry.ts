import type { Entry } from '../core';

/** Maximum number of authors shown before truncation with "et al." */
export const AUTHOR_DISPLAY_LIMIT = 3;

/**
 * Render an entry's title / citekey / year / authors into `container` using the
 * shared `zotero*` suggestion classes. Used by both the search modal and the
 * inline editor suggester so the result row markup stays in one place.
 *
 * The caller owns `container` (and its `zoteroResult` class / reset); this only
 * appends the field spans.
 */
export function renderEntrySuggestion(
  container: HTMLElement,
  entry: Entry,
  authorLimit: number = AUTHOR_DISPLAY_LIMIT,
): void {
  container.createSpan({ cls: 'zoteroTitle', text: entry.title || '' });
  container.createSpan({ cls: 'zoteroCitekey', text: entry.displayKey() });

  const yearString = entry.yearString();
  if (yearString) {
    container.createSpan({ cls: 'zoteroYear', text: yearString });
  }

  container.createSpan({
    cls: entry.authorString
      ? 'zoteroAuthors'
      : 'zoteroAuthors zoteroAuthorsEmpty',
    text: entry.displayAuthors(authorLimit),
  });
}
