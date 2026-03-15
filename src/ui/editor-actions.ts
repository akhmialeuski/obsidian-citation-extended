import { Editor, MarkdownView, Notice } from 'obsidian';
import CitationPlugin from '../main';
import { LibraryNotReadyError } from '../core';
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

  async openLiteratureNote(citekey: string, newPane: boolean): Promise<void> {
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
      );
    } catch (e) {
      console.error('Failed to open literature note:', e);
      new Notice(
        'Unable to open literature note. Please check that the literature note folder exists.',
      );
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
      const file = await this.plugin.noteService.getOrCreateLiteratureNoteFile(
        citekey,
        library,
      );
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
      console.error('Failed to insert literature note link:', error);
      new Notice('Failed to insert literature note link');
    }
  }

  insertLiteratureNoteContent(citekey: string): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const contentResult = this.plugin.getInitialContentForCitekey(citekey);
    if (!contentResult.ok) {
      new Notice(contentResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(contentResult.value, cursor);
  }

  insertMarkdownCitation(citekey: string, alternative = false): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const citationResult = alternative
      ? this.plugin.getAlternativeMarkdownCitationForCitekey(citekey)
      : this.plugin.getMarkdownCitationForCitekey(citekey);

    if (!citationResult.ok) {
      new Notice(citationResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(citationResult.value, cursor);
  }
}
