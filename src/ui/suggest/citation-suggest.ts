import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from 'obsidian';
import { Entry } from '../../core';
import type { ICitationService } from '../../container';
import type { ILibraryService } from '../../container';
import type { CitationsPluginSettings } from '../settings/settings';
import { sortEntries } from '../../library/sort-entries';

/** Maximum number of authors shown before truncation with "et al." */
const AUTHOR_DISPLAY_LIMIT = 3;

/** Maximum number of suggestions surfaced in the popover. */
const SUGGESTION_LIMIT = 20;

/**
 * Matches a citation trigger at the end of the text before the cursor:
 * an optional opening bracket, an `@`, then the (possibly empty) query.
 *
 * A leading boundary (start of line or a non-word, non-`@` character) is
 * required so the suggester does not fire inside e-mail addresses such as
 * `john@example.com` — there the character before `@` is a word character.
 *
 * Capture groups: 1 = optional `[`, 2 = query text after `@`.
 */
const TRIGGER_RE = /(?:^|[^\w@])(\[?)@([\p{L}\d:.\-_+?#$%&/~<>]*)$/u;

/** Dependencies the suggester needs, kept free of the concrete plugin class. */
export interface CitationSuggestDeps {
  readonly libraryService: ILibraryService;
  readonly citationService: ICitationService;
  readonly settings: CitationsPluginSettings;
}

/**
 * Inline citekey autocomplete. While typing `@` or `[@` in the editor, a
 * popover lists matching references (reusing the same fuzzy search index as
 * the search modal). Selecting one replaces the trigger with the configured
 * Markdown citation; holding Shift inserts the alternative citation format.
 *
 * This is the single most-requested feature for citation plugins — it removes
 * the need to open the search modal for the common "cite while writing" path.
 */
export class CitationEditorSuggest extends EditorSuggest<Entry> {
  limit = SUGGESTION_LIMIT;

  constructor(
    app: App,
    private deps: CitationSuggestDeps,
  ) {
    super(app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    // Cheap early outs first — onTrigger runs on every keypress.
    if (!this.deps.settings.enableInlineSuggestions) return null;
    if (!this.deps.libraryService.library) return null;

    const line = editor.getLine(cursor.line);
    const before = line.slice(0, cursor.ch);
    const match = TRIGGER_RE.exec(before);
    if (!match) return null;

    const bracket = match[1];
    const query = match[2];
    // The trigger text (`[?@query`) is exactly the suffix of `before` because
    // the regex is anchored at the end, so its start column is unambiguous.
    const triggerText = `${bracket}@${query}`;
    const startCh = cursor.ch - triggerText.length;

    return {
      start: { line: cursor.line, ch: startCh },
      end: cursor,
      query,
    };
  }

  getSuggestions(context: EditorSuggestContext): Entry[] {
    const library = this.deps.libraryService.library;
    if (!library) return [];

    const sortOrder = this.deps.settings.referenceListSortOrder;
    const query = context.query;

    if (!query) {
      return this.deps.libraryService
        .getSortedEntries(sortOrder)
        .slice(0, this.limit);
    }

    const ids = this.deps.libraryService.searchService.search(
      query,
      this.limit,
    );
    const entries = ids.map((id) => library.entries[id]).filter(Boolean);
    return sortEntries(entries, sortOrder);
  }

  renderSuggestion(entry: Entry, el: HTMLElement): void {
    el.addClass('zoteroResult');
    el.createSpan({ cls: 'zoteroTitle', text: entry.title || '' });
    el.createSpan({ cls: 'zoteroCitekey', text: entry.displayKey() });

    const yearString = entry.yearString();
    if (yearString) {
      el.createSpan({ cls: 'zoteroYear', text: yearString });
    }

    const authors = entry.displayAuthors(AUTHOR_DISPLAY_LIMIT);
    el.createSpan({
      cls: entry.authorString
        ? 'zoteroAuthors'
        : 'zoteroAuthors zoteroAuthorsEmpty',
      text: authors,
    });
  }

  selectSuggestion(entry: Entry, evt: MouseEvent | KeyboardEvent): void {
    const context = this.context;
    if (!context) return;

    const useAlternative = evt.shiftKey;
    const result = this.deps.citationService.getMarkdownCitation(
      entry.id,
      useAlternative,
    );
    if (!result.ok) {
      console.error(
        'Citation suggest: failed to render citation',
        result.error,
      );
      return;
    }

    const citation = result.value;
    // Replace the whole trigger range (the optional `[`, the `@`, and the typed
    // query) so a configured `[@key]` template never double-brackets a `[@`
    // the user already started typing.
    context.editor.replaceRange(citation, context.start, context.end);
    const newCursor: EditorPosition = {
      line: context.start.line,
      ch: context.start.ch + citation.length,
    };
    context.editor.setCursor(newCursor);
  }
}
