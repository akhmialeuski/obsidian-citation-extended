import { Editor, MarkdownView, Notice, TFile } from 'obsidian';
import CitationPlugin from '../main';
import { LibraryNotReadyError, LiteratureNoteNotFoundError } from '../core';
import { VaultExt, WorkspaceExt } from '../obsidian-extensions.d';

export class EditorActions {
  constructor(private plugin: CitationPlugin) {}

  private getActiveEditor(): Editor | null {
    // Standard MarkdownView approach
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) return view.editor;

    // Fallback: activeEditor supports Canvas text nodes, Lineage, etc.
    const ext = this.plugin.app.workspace as WorkspaceExt;
    return ext.activeEditor?.editor ?? null;
  }

  async openLiteratureNote(
    citekey: string,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void> {
    const library = this.plugin.libraryService.library;
    if (!library) {
      new Notice(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.plugin.getEntry(citekey);
    if (!entryResult.ok) {
      new Notice(entryResult.error.message);
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
        new Notice(e.message);
      } else {
        console.error('Failed to open literature note:', e);
        new Notice(
          'Unable to open literature note. Please check that the literature note folder exists.',
        );
      }
    }
  }

  async insertLiteratureNoteLink(citekey: string): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const library = this.plugin.libraryService.library;
    if (!library) {
      new Notice(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.plugin.getEntry(citekey);
    if (!entryResult.ok) {
      new Notice(entryResult.error.message);
      return;
    }

    try {
      let file: TFile;
      if (this.plugin.settings.disableAutomaticNoteCreation) {
        const existing = this.plugin.noteService.findExistingLiteratureNoteFile(
          citekey,
          library,
        );
        if (!existing) {
          new Notice(new LiteratureNoteNotFoundError(citekey).message);
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
        new Notice(titleResult.error.message);
        return;
      }

      const useMarkdown = (this.plugin.app.vault as VaultExt).getConfig(
        'useMarkdownLinks',
      );

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.plugin.app.metadataCache.fileToLinktext(file, '', false),
        );
        linkText = `[${titleResult.value}](${uri})`;
      } else {
        linkText = this.plugin.app.metadataCache.fileToLinktext(file, '', true);
        linkText = `[[${linkText}]]`;
      }

      editor.replaceSelection(linkText);
    } catch (error) {
      if (error instanceof LiteratureNoteNotFoundError) {
        new Notice(error.message);
      } else {
        console.error('Failed to insert literature note link:', error);
        new Notice('Failed to insert literature note link');
      }
    }
  }

  async insertLiteratureNoteContent(
    citekey: string,
    selectedText?: string,
  ): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const contentResult = await this.plugin.getInitialContentForCitekey(
      citekey,
      selectedText,
    );
    if (!contentResult.ok) {
      new Notice(contentResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(contentResult.value, cursor);
  }

  async insertMarkdownCitation(
    citekey: string,
    alternative = false,
    selectedText?: string,
  ): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const citationResult = alternative
      ? this.plugin.getAlternativeMarkdownCitationForCitekey(
          citekey,
          selectedText,
        )
      : this.plugin.getMarkdownCitationForCitekey(citekey, selectedText);

    if (!citationResult.ok) {
      new Notice(citationResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(citationResult.value, cursor);

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
