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
import { AUTHOR_DISPLAY_LIMIT, renderEntrySuggestion } from '../render-entry';

/** Maximum number of suggestions surfaced in the popover. */
const SUGGESTION_LIMIT = 20;

/**
 * Matches a citation trigger at the end of the text before the cursor, in one
 * of two forms, so the whole trigger (including any leading `[`) is captured as
 * `match[0]`:
 *
 * - `[@query` — an explicit Pandoc bracket. Always a citation, regardless of
 *   the preceding character, so `word[@` works without dropping the `[`
 *   (which would otherwise produce a double bracket on insertion).
 * - bare `@query` — only when NOT preceded by a word character or another `@`,
 *   so it never fires inside an e-mail address (`john@example.com`).
 *
 * Capture group 1 is the query text after `@`; `match[0]` is the full trigger.
 */
const TRIGGER_RE = /(?:\[@|(?<![\w@])@)([\p{L}\d:.\-_+?#$%&/~<>]*)$/u;

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

    const query = match[1];
    // `match[0]` is the full trigger (`[@query` or `@query`) and, being anchored
    // at the end, is exactly the suffix of `before`. Replacing the whole range
    // — including a leading `[` — is what prevents a `[@key]` template from
    // double-bracketing a `[@` the user already typed.
    const startCh = cursor.ch - match[0].length;

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
    renderEntrySuggestion(el, entry, AUTHOR_DISPLAY_LIMIT);
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
