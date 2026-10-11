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
 * Opens the "Insert or replace with template output" dialog for the literature
 * note in the active editor: it replaces the selected text, or inserts at the
 * cursor when nothing is selected. Available from the command palette, and
 * from the editor context menu whenever text is selected.
 */
export class ReplaceSelectionWithTemplateAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor = {
    id: 'replace-selection-with-template',
    name: 'Insert or replace with template output',
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

  /** Shown in the context menu only on a selection; the palette inserts too. */
  isVisible(invocation: ActionInvocationContext): boolean {
    return (invocation.selectedText ?? '') !== '';
  }

  async execute(_invocation: ActionInvocationContext): Promise<void> {
    const { platform } = this.ctx;

    const editor = platform.workspace.getActiveEditor();
    if (!editor) {
      platform.notifications.show(
        'Citations: Open the literature note in the editor first.',
      );
      return;
    }
    const text = editor.getSelection();

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
