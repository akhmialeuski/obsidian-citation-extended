import CitationPlugin from '../main';
import { LibraryNotReadyError, LiteratureNoteNotFoundError } from '../core';
import { IEditorProxy } from '../platform/platform-adapter';

/**
 * Regex patterns to detect a citation citekey at the cursor position.
 * Matches: [@citekey], @citekey, [[@citekey]], [[citekey]]
 */
const CITEKEY_PATTERNS = [
  /\[\[@([^\]|]+)(?:\|[^\]]+)?\]\]/g, // [[@citekey]] or [[@citekey|alias]] — must be before [@...] to avoid partial match
  /\[@([^\]]+)\]/g, // [@citekey]
  /(?:^|[^[])@([\w:.#$%&\-+?<>~/]+)/g, // standalone @citekey
];

export class EditorActions {
  constructor(private plugin: CitationPlugin) {}

  private get platform() {
    return this.plugin.platform;
  }

  private getActiveEditor(): IEditorProxy | null {
    return this.platform.workspace.getActiveEditor();
  }

  async openLiteratureNote(
    citekey: string,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void> {
    const library = this.plugin.libraryService.library;
    if (!library) {
      this.platform.notifications.show(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.plugin.getEntry(citekey);
    if (!entryResult.ok) {
      this.platform.notifications.show(entryResult.error.message);
      return;
    }

    try {
      await this.plugin.noteService.openLiteratureNote(
        citekey,
        library,
        newPane,
        selectedText,
      );
    } catch (e) {
      if (e instanceof LiteratureNoteNotFoundError) {
        this.platform.notifications.show(e.message);
      } else {
        console.error('Failed to open literature note:', e);
        this.platform.notifications.show(
          'Unable to open literature note. Please check that the literature note folder exists.',
        );
      }
    }
  }

  async insertLiteratureNoteLink(citekey: string): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      this.platform.notifications.show('No active editor found');
      return;
    }

    const library = this.plugin.libraryService.library;
    if (!library) {
      this.platform.notifications.show(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.plugin.getEntry(citekey);
    if (!entryResult.ok) {
      this.platform.notifications.show(entryResult.error.message);
      return;
    }

    try {
      let file;
      if (this.plugin.settings.disableAutomaticNoteCreation) {
        const existing = this.plugin.noteService.findExistingLiteratureNoteFile(
          citekey,
          library,
        );
        if (!existing) {
          this.platform.notifications.show(
            new LiteratureNoteNotFoundError(citekey).message,
          );
          return;
        }
        file = existing;
      } else {
        file = await this.plugin.noteService.getOrCreateLiteratureNoteFile(
          citekey,
          library,
        );
      }

      const titleResult = this.plugin.getTitleForCitekey(citekey);
      if (!titleResult.ok) {
        this.platform.notifications.show(titleResult.error.message);
        return;
      }

      const useMarkdown = this.platform.workspace.getConfig('useMarkdownLinks');

      // Resolve the display text for the link.  When a custom template is set
      // it overrides the default (citekey for Markdown, title for Wiki).
      const displayTemplate =
        this.plugin.settings.literatureNoteLinkDisplayTemplate;
      let displayText: string;
      if (displayTemplate) {
        const vars = this.plugin.templateService.getTemplateVariables(
          entryResult.value,
        );
        const renderResult = this.plugin.templateService.render(
          displayTemplate,
          vars,
        );
        displayText = renderResult.ok ? renderResult.value : citekey;
      } else {
        // Default: citekey for Markdown links (#271), title for Wiki links
        displayText = useMarkdown ? citekey : titleResult.value;
      }

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.platform.workspace.fileToLinktext(file, '', false),
        );
        linkText = `[${displayText}](${uri})`;
      } else {
        const wikiTarget = this.platform.workspace.fileToLinktext(
          file,
          '',
          true,
        );
        linkText =
          displayText !== titleResult.value
            ? `[[${wikiTarget}|${displayText}]]`
            : `[[${wikiTarget}]]`;
      }

      editor.replaceSelection(linkText);
    } catch (error) {
      if (error instanceof LiteratureNoteNotFoundError) {
        this.platform.notifications.show(error.message);
      } else {
        console.error('Failed to insert literature note link:', error);
        this.platform.notifications.show(
          'Failed to insert literature note link',
        );
      }
    }
  }

  async insertLiteratureNoteContent(
    citekey: string,
    selectedText?: string,
  ): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      this.platform.notifications.show('No active editor found');
      return;
    }

    const contentResult = await this.plugin.getInitialContentForCitekey(
      citekey,
      selectedText,
    );
    if (!contentResult.ok) {
      this.platform.notifications.show(contentResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(contentResult.value, cursor);

    // Move cursor to end of inserted content
    const lines = contentResult.value.split('\n');
    const lastLineLength = lines[lines.length - 1].length;
    const newLine = cursor.line + lines.length - 1;
    const newCh =
      lines.length === 1 ? cursor.ch + lastLineLength : lastLineLength;
    editor.setCursor({ line: newLine, ch: newCh });
  }

  async insertMarkdownCitation(
    citekey: string,
    alternative = false,
    selectedText?: string,
  ): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      this.platform.notifications.show('No active editor found');
      return;
    }

    const citationResult = alternative
      ? this.plugin.getAlternativeMarkdownCitationForCitekey(
          citekey,
          selectedText,
        )
      : this.plugin.getMarkdownCitationForCitekey(citekey, selectedText);

    if (!citationResult.ok) {
      this.platform.notifications.show(citationResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(citationResult.value, cursor);

    // Move cursor to end of inserted text so the user can continue typing
    const lines = citationResult.value.split('\n');
    const lastLineLength = lines[lines.length - 1].length;
    const newLine = cursor.line + lines.length - 1;
    const newCh =
      lines.length === 1 ? cursor.ch + lastLineLength : lastLineLength;
    editor.setCursor({ line: newLine, ch: newCh });

    // Silently create the literature note if the setting is enabled
    if (this.plugin.settings.autoCreateNoteOnCitation) {
      const library = this.plugin.libraryService.library;
      if (library) {
        try {
          await this.plugin.noteService.getOrCreateLiteratureNoteFile(
            citekey,
            library,
            selectedText,
          );
        } catch (e) {
          console.warn('Failed to auto-create literature note:', e);
        }
      }
    }
  }

  /**
   * Extract a citekey from the text surrounding the cursor position.
   * Scans the current line for known citation patterns.
   */
  extractCitekeyAtCursor(editor: IEditorProxy): string | null {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const ch = cursor.ch;

    for (const pattern of CITEKEY_PATTERNS) {
      // Reset lastIndex for global regex
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
   * Insert an additional citekey into an existing citation at cursor (#149).
   * Transforms [@key1] → [@key1; @key2] when the cursor is inside a citation.
   * If no existing citation is found, falls back to normal citation insertion.
   */
  async insertSubsequentCitation(newCitekey: string): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      this.platform.notifications.show('No active editor found');
      return;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Find the [@...] citation block that contains the cursor
    const citationPattern = /\[(@[^\]]+)\]/g;
    let match;
    while ((match = citationPattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (cursor.ch >= start && cursor.ch <= end) {
        // Insert "; @newCitekey" before the closing bracket
        const insertPos = { line: cursor.line, ch: end - 1 };
        editor.replaceRange(`; @${newCitekey}`, insertPos);
        // Move cursor to end of inserted text
        editor.setCursor({
          line: cursor.line,
          ch: insertPos.ch + `; @${newCitekey}`.length,
        });
        return;
      }
    }

    // No existing citation at cursor — insert as normal citation
    await this.insertMarkdownCitation(newCitekey, false);
  }

  /**
   * Open the literature note for the citation under the cursor (#203).
   */
  async openNoteAtCursor(): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      this.platform.notifications.show('No active editor found');
      return;
    }

    const citekey = this.extractCitekeyAtCursor(editor);
    if (!citekey) {
      this.platform.notifications.show('No citation found at cursor position.');
      return;
    }

    await this.openLiteratureNote(citekey, false);
  }
}
