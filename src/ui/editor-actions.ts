import CitationPlugin from '../main';
import { LibraryNotReadyError, LiteratureNoteNotFoundError } from '../core';
import { IEditorProxy } from '../platform/platform-adapter';

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

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.platform.workspace.fileToLinktext(file, '', false),
        );
        linkText = `[${titleResult.value}](${uri})`;
      } else {
        linkText = this.platform.workspace.fileToLinktext(file, '', true);
        linkText = `[[${linkText}]]`;
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
}
