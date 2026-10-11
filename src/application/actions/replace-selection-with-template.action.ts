import { ApplicationAction } from './action.types';
import type {
  ActionContext,
  ActionDescriptor,
  ActionInvocationContext,
} from './action.types';
import type { IContentTemplateResolver } from '../content-template-resolver';
import {
  TemplateSelectionDialog,
  type ITemplateSelectionPresenter,
} from '../template-selection-dialog';

/**
 * Opens the "Replace selection with template" dialog for the selected text of
 * the literature note in the active editor. Available from the command palette
 * and from the editor context menu whenever text is selected.
 */
export class ReplaceSelectionWithTemplateAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'replace-selection-with-template',
    name: 'Replace selection with template output',
    icon: 'wand-2',
    showInCommandPalette: true,
    showInContextMenu: true,
    requiresEditor: true,
  };

  constructor(
    ctx: ActionContext,
    private readonly templateResolver: IContentTemplateResolver,
    private readonly saveSettings: () => Promise<void>,
    private readonly presenter: ITemplateSelectionPresenter,
  ) {
    super(ctx);
  }

  isVisible(invocation: ActionInvocationContext): boolean {
    return (invocation.selectedText ?? '') !== '';
  }

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    const { platform } = this.ctx;

    const editor = platform.workspace.getActiveEditor();
    const text = editor?.getSelection() ?? '';
    if (!editor || text === '') {
      platform.notifications.show(
        'Citations: Select the text to replace first.',
      );
      return;
    }

    const note = this.resolveActiveNote();
    if (!note) return;

    const entry = this.ctx.citationService.getEntry(note.citekey);
    if (!entry.ok) {
      platform.notifications.show(`Citations: ${entry.error.message}`);
      return;
    }

    this.presenter.open(
      new TemplateSelectionDialog(
        { citekey: note.citekey, filePath: note.file.path, text },
        this.ctx.templateService.getTemplateVariables(entry.value),
        editor,
        this.ctx.templateService,
        this.templateResolver,
        this.ctx.settings,
        this.saveSettings,
      ),
    );
  }
}
