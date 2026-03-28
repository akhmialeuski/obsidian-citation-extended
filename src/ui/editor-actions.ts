import type { ICitationService } from '../application/citation.service';
import type {
  IPlatformAdapter,
  IEditorProxy,
} from '../platform/platform-adapter';
import type {
  INoteService,
  ILibraryService,
  ITemplateService,
} from '../container';
import type { CitationsPluginSettings } from './settings/settings';
import { LibraryNotReadyError, LiteratureNoteNotFoundError } from '../core';
import { extractCitekeyAtCursor as extractCitekey } from '../application/citekey-extractor';

export class EditorActions {
  constructor(
    private citationService: ICitationService,
    private platform: IPlatformAdapter,
    private noteService: INoteService,
    private libraryService: ILibraryService,
    private templateService: ITemplateService,
    private settings: CitationsPluginSettings,
  ) {}

  private getActiveEditor(): IEditorProxy | null {
    return this.platform.workspace.getActiveEditor();
  }

  async openLiteratureNote(
    citekey: string,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void> {
    const library = this.libraryService.library;
    if (!library) {
      this.platform.notifications.show(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.citationService.getEntry(citekey);
    if (!entryResult.ok) {
      this.platform.notifications.show(entryResult.error.message);
      return;
    }

    try {
      await this.noteService.openLiteratureNote(
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

    const library = this.libraryService.library;
    if (!library) {
      this.platform.notifications.show(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.citationService.getEntry(citekey);
    if (!entryResult.ok) {
      this.platform.notifications.show(entryResult.error.message);
      return;
    }

    try {
      let file;
      if (this.settings.disableAutomaticNoteCreation) {
        const existing = this.noteService.findExistingLiteratureNoteFile(
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
        file = await this.noteService.getOrCreateLiteratureNoteFile(
          citekey,
          library,
        );
      }

      const titleResult = this.citationService.getTitleForCitekey(citekey);
      if (!titleResult.ok) {
        this.platform.notifications.show(titleResult.error.message);
        return;
      }

      const useMarkdown = this.platform.workspace.getConfig('useMarkdownLinks');

      // Resolve the display text for the link.  When a custom template is set
      // it overrides the default (citekey for Markdown, title for Wiki).
      const displayTemplate = this.settings.literatureNoteLinkDisplayTemplate;
      let displayText: string;
      if (displayTemplate) {
        const vars = this.templateService.getTemplateVariables(
          entryResult.value,
        );
        const renderResult = this.templateService.render(displayTemplate, vars);
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

    const contentResult =
      await this.citationService.getInitialContentForCitekey(
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

    const citationResult = this.citationService.getMarkdownCitation(
      citekey,
      alternative,
      selectedText,
    );

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
    if (this.settings.autoCreateNoteOnCitation) {
      const library = this.libraryService.library;
      if (library) {
        try {
          await this.noteService.getOrCreateLiteratureNoteFile(
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
   * Delegates to the shared citekey-extractor module.
   */
  extractCitekeyAtCursor(editor: IEditorProxy): string | null {
    return extractCitekey(editor);
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
