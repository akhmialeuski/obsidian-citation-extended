import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { lineDiff } from '../../core';
import type {
  ITemplateSelectionPresenter,
  TemplateSelectionDialog,
} from '../../application/template-selection-dialog';
import type { FragmentProfile } from '../../domain/fragment-profile';
import { renderLineDiff } from '../render-line-diff';
import { ProfileSuggest } from '../suggest/profile-suggest';

/**
 * The "Replace selection with template" dialog. Shows the selected text, lets
 * the user extract the template part that produced it from a template set in
 * the settings or load a fragment profile, edit the template with a live diff
 * preview, save it as a profile, and replace the selection with its output.
 */
export class ReplaceSelectionModal extends Modal {
  /** Profile the name field refers to; '' while the name is new. */
  private profileId = '';
  private profileName = '';
  private template = '';
  private rendered: string | null = null;

  private nameInput!: HTMLInputElement;
  private templateInput!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private nameErrorEl!: HTMLElement;
  private previewEl!: HTMLElement;
  private saveButton!: ButtonComponent;
  private applyButton!: ButtonComponent;

  constructor(
    app: App,
    private readonly dialog: TemplateSelectionDialog,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const { selection } = this.dialog;
    contentEl.addClass('citation-fragment-modal');
    this.titleEl.setText('Replace selection with template');

    contentEl.createEl('p', {
      cls: 'citation-fragment-meta',
      text: `@${selection.citekey} · ${selection.filePath}`,
    });
    contentEl.createDiv({
      cls: 'citation-fragment-quote',
      text: selection.text,
    });

    const sources = this.dialog.templateSources();
    let sourcePath = sources[0] ?? '';
    new Setting(contentEl)
      .setName('Extract from')
      .setDesc('Templates from the plugin settings.')
      .addDropdown((dropdown) => {
        for (const path of sources) dropdown.addOption(path, path);
        dropdown.setValue(sourcePath).onChange((value) => {
          sourcePath = value;
        });
      })
      .addButton((button) =>
        button
          .setButtonText('Extract')
          .setDisabled(sources.length === 0)
          .onClick(() => void this.extract(sourcePath)),
      );

    const profileRow = new Setting(contentEl)
      .setName('Profile')
      .setDesc('Pick a profile or type a new name.')
      .addText((text) => {
        this.nameInput = text.inputEl;
        text.setPlaceholder('Name or profile').onChange((value) => {
          this.profileName = value;
          this.refresh();
        });
        new ProfileSuggest(
          this.app,
          text.inputEl,
          () => this.dialog.profiles(),
          {
            pick: (profile) => this.loadProfile(profile),
            create: (name) => {
              this.profileId = '';
              this.setName(name);
            },
            rename: (profile) => {
              this.loadProfile(profile);
              this.nameInput.focus();
              this.nameInput.select();
            },
          },
        );
      })
      .addButton((button) => {
        this.saveButton = button
          .setButtonText('Save')
          .onClick(() => void this.save());
      });
    this.nameErrorEl = profileRow.descEl.createDiv({
      cls: 'citation-fragment-error',
    });

    contentEl.createDiv({
      cls: 'citation-fragment-label',
      text: 'Template',
    });
    this.templateInput = contentEl.createEl('textarea', {
      cls: 'citation-fragment-editor',
      attr: {
        rows: '3',
        placeholder:
          'Extract the part of the template that produced the selection, pick a profile, or type a template.',
      },
    });
    this.templateInput.addEventListener('input', () => {
      this.template = this.templateInput.value;
      this.refresh();
    });
    this.statusEl = contentEl.createDiv({ cls: 'citation-fragment-status' });

    contentEl.createDiv({
      cls: 'citation-fragment-label',
      text: 'Result in the note',
    });
    this.previewEl = contentEl.createDiv({ cls: 'citation-review-diff' });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText('Cancel').onClick(() => this.close()),
      )
      .addButton((button) => {
        this.applyButton = button
          .setButtonText('Apply')
          .setCta()
          .onClick(() => this.apply());
      });

    this.refresh();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async extract(sourcePath: string): Promise<void> {
    const match = await this.dialog.extract(sourcePath);
    if (!match) {
      this.setStatus(
        'is-warning',
        `Not found in ${sourcePath}. Pick a profile or type a template.`,
      );
      return;
    }
    this.setTemplate(match.template);
    const lines =
      match.firstLine === match.lastLine
        ? `line ${match.firstLine}`
        : `lines ${match.firstLine} to ${match.lastLine}`;
    this.setStatus('is-ok', `Extracted from ${sourcePath}, ${lines}.`);
  }

  private async save(): Promise<void> {
    try {
      const saved = await this.dialog.saveProfile(
        this.profileId,
        this.profileName,
        this.template,
      );
      this.profileId = saved.id;
      new Notice(`Citations: Profile "${saved.name}" saved.`);
    } catch (e) {
      new Notice(`Citations: ${(e as Error).message}`);
    }
    this.refresh();
  }

  private apply(): void {
    if (this.rendered === null) return;
    this.dialog.apply(this.rendered);
    this.close();
  }

  private loadProfile(profile: FragmentProfile): void {
    this.profileId = profile.id;
    this.setName(profile.name);
    this.setTemplate(profile.template);
    this.setStatus('is-ok', `Loaded profile "${profile.name}".`);
  }

  private setName(name: string): void {
    this.profileName = name;
    this.nameInput.value = name;
    this.refresh();
  }

  private setTemplate(template: string): void {
    this.template = template;
    this.templateInput.value = template;
    this.refresh();
  }

  private setStatus(kind: 'is-ok' | 'is-warning', text: string): void {
    this.statusEl.className = `citation-fragment-status ${kind}`;
    this.statusEl.setText(text);
  }

  /** Re-render the preview and the enabled state of Save and Apply. */
  private refresh(): void {
    this.previewEl.empty();
    this.rendered = null;
    if (this.template === '') {
      this.previewEl.createDiv({
        cls: 'citation-diff-line is-fold',
        text: 'Extract or type a template to see the result.',
      });
    } else {
      const result = this.dialog.render(this.template);
      if (result.ok) {
        this.rendered = result.value;
        renderLineDiff(
          this.previewEl,
          lineDiff(this.dialog.selection.text, result.value),
        );
      } else {
        this.previewEl.createDiv({
          cls: 'citation-diff-line is-removed',
          text: result.error.message,
        });
      }
    }

    const rejection =
      this.profileName === ''
        ? undefined
        : this.dialog.nameRejection(this.profileId, this.profileName);
    this.nameErrorEl.setText(rejection ?? '');
    this.saveButton.setDisabled(
      this.template === '' ||
        this.profileName.trim() === '' ||
        rejection !== undefined,
    );
    this.applyButton.setDisabled(this.rendered === null);
  }
}

/** Opens {@link ReplaceSelectionModal}; the UI side of the dialog port. */
export class ModalTemplateSelectionPresenter implements ITemplateSelectionPresenter {
  constructor(private readonly app: App) {}

  open(dialog: TemplateSelectionDialog): void {
    new ReplaceSelectionModal(this.app, dialog).open();
  }
}
