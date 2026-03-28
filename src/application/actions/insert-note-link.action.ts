import {
  Entry,
  LiteratureNoteNotFoundError,
  LibraryNotReadyError,
} from '../../core';
import {
  SearchModalAction,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';

export class InsertNoteLinkAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor = {
    id: 'insert-citation',
    name: 'Insert literature note link',
    showInCommandPalette: true,
    showInContextMenu: true,
    requiresEditor: true,
  };

  onChoose = async (item: Entry) => {
    await this.insertLink(item.id);
  };

  async execute(invocation: ActionInvocationContext): Promise<void> {
    if (!invocation.citekey) return;
    await this.insertLink(invocation.citekey);
  }

  getInstructions() {
    return [
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert literature note reference' },
      { command: 'esc', purpose: 'to dismiss' },
    ];
  }

  private async insertLink(citekey: string): Promise<void> {
    const editor = this.ctx.platform.workspace.getActiveEditor();
    if (!editor) {
      this.ctx.platform.notifications.show('No active editor found');
      return;
    }

    const library = this.ctx.libraryService.library;
    if (!library) {
      this.ctx.platform.notifications.show(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.ctx.citationService.getEntry(citekey);
    if (!entryResult.ok) {
      this.ctx.platform.notifications.show(entryResult.error.message);
      return;
    }

    try {
      let file;
      if (this.ctx.settings.disableAutomaticNoteCreation) {
        const existing = this.ctx.noteService.findExistingLiteratureNoteFile(
          citekey,
          library,
        );
        if (!existing) {
          this.ctx.platform.notifications.show(
            new LiteratureNoteNotFoundError(citekey).message,
          );
          return;
        }
        file = existing;
      } else {
        file = await this.ctx.noteService.getOrCreateLiteratureNoteFile(
          citekey,
          library,
        );
      }

      const titleResult = this.ctx.citationService.getTitleForCitekey(citekey);
      if (!titleResult.ok) {
        this.ctx.platform.notifications.show(titleResult.error.message);
        return;
      }

      const useMarkdown =
        this.ctx.platform.workspace.getConfig('useMarkdownLinks');

      const displayTemplate =
        this.ctx.settings.literatureNoteLinkDisplayTemplate;
      let displayText: string;
      if (displayTemplate) {
        const vars = this.ctx.templateService.getTemplateVariables(
          entryResult.value,
        );
        const renderResult = this.ctx.templateService.render(
          displayTemplate,
          vars,
        );
        displayText = renderResult.ok ? renderResult.value : citekey;
      } else {
        displayText = useMarkdown ? citekey : titleResult.value;
      }

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.ctx.platform.workspace.fileToLinktext(file, '', false),
        );
        linkText = `[${displayText}](${uri})`;
      } else {
        const wikiTarget = this.ctx.platform.workspace.fileToLinktext(
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
        this.ctx.platform.notifications.show(error.message);
      } else {
        console.error('Failed to insert literature note link:', error);
        this.ctx.platform.notifications.show(
          'Failed to insert literature note link',
        );
      }
    }
  }
}
