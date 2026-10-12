import type { ITemplateService } from '../container';
import type { IContentTemplateResolver } from './content-template-resolver';
import type {
  IEditorPosition,
  IEditorProxy,
} from '../platform/platform-adapter';
import {
  lineDiff,
  ok,
  type DiffHunk,
  type Result,
  type TemplateContext,
  type TemplateRenderError,
} from '../core';
import type { CitationsPluginSettings } from '../ui/settings/settings';
import {
  addProfile,
  createProfile,
  profileNameRejection,
  updateProfile,
  type FragmentProfile,
} from '../domain/fragment-profile';
import {
  locateTemplateFragment,
  type TemplateFragmentMatch,
} from '../template/template-fragment-locator';

/**
 * The application side of the "Insert or replace with template output"
 * dialog: the selection it is bound to, the port that opens it, and the model
 * the UI drives.
 */

/** Where the dialog was opened: the note, its entry and the selected text. */
export interface TemplateSelection {
  citekey: string;
  filePath: string;
  /**
   * The text Apply replaces; '' when nothing is selected and Apply inserts at
   * the cursor. A successful extract widens it to the whole selected lines.
   */
  text: string;
}

/** Opens the dialog. Implemented by the UI layer, so this layer stays free of Obsidian. */
export interface ITemplateSelectionPresenter {
  open(dialog: TemplateSelectionDialog): void;
}

/**
 * Model behind the "Insert or replace with template output" dialog, bound to
 * one selection (or one cursor position) in one literature note. It extracts
 * the template part that produced the selection, renders templates with the
 * note's entry, keeps the fragment profiles in the settings, and replaces the
 * selection, or inserts at the cursor, on apply. Nothing is tracked after apply.
 */
export class TemplateSelectionDialog {
  constructor(
    readonly selection: TemplateSelection,
    private readonly variables: TemplateContext,
    private readonly editor: IEditorProxy,
    private readonly templateService: ITemplateService,
    private readonly templateResolver: IContentTemplateResolver,
    private readonly settings: CitationsPluginSettings,
    private readonly saveSettings: () => Promise<void>,
  ) {}

  /** Template files configured in the settings, offered under "Extract from". */
  templateSources(): string[] {
    return this.templateResolver.listTemplateSources();
  }

  /** True when nothing is selected, so Apply inserts at the cursor. */
  get inserts(): boolean {
    return this.selection.text === '';
  }

  /**
   * Find the part of the template at `templatePath` that produced the
   * selection. The match is whole template lines, so on success the editor
   * selection is widened to whole note lines too; otherwise Apply would put a
   * line's literal text (`PDF: `) in front of the part of it left unselected.
   */
  async extract(templatePath: string): Promise<TemplateFragmentMatch | null> {
    if (this.inserts) return null;
    const template = await this.templateResolver.readTemplate(templatePath);
    const lines = this.selectedLines();
    const match = locateTemplateFragment(template, lines.text, (source) => {
      const rendered = this.render(source);
      return rendered.ok ? rendered.value : null;
    });
    if (match && lines.text !== this.selection.text) {
      this.editor.setSelection(lines.from, lines.to);
      this.selection.text = lines.text;
    }
    return match;
  }

  /** The note lines the selection touches, as positions and text. */
  private selectedLines(): {
    from: IEditorPosition;
    to: IEditorPosition;
    text: string;
  } {
    const start = this.editor.getCursor('from');
    const end = this.editor.getCursor('to');
    // A selection ending at the start of a line does not include that line.
    const lastLine =
      end.ch === 0 && end.line > start.line ? end.line - 1 : end.line;
    const text: string[] = [];
    for (let line = start.line; line <= lastLine; line++) {
      text.push(this.editor.getLine(line));
    }
    return {
      from: { line: start.line, ch: 0 },
      to: { line: lastLine, ch: text[text.length - 1].length },
      text: text.join('\n'),
    };
  }

  /** Render a template with the entry of the note. */
  render(template: string): Result<string, TemplateRenderError> {
    return this.templateService.render(template, this.variables);
  }

  /**
   * The text Apply writes and the preview shows: `template` rendered, without
   * a final line break the selection does not end with. A block unit such as
   * `{{#each}}…{{/each}}` renders with the line break of its last line, while
   * a selection of whole note lines stops before it, so writing the output as
   * is would add an empty line on every apply. Insert mode keeps it.
   */
  output(template: string): Result<string, TemplateRenderError> {
    const rendered = this.render(template);
    if (!rendered.ok || this.inserts || this.selection.text.endsWith('\n')) {
      return rendered;
    }
    return ok(rendered.value.replace(/\n$/, ''));
  }

  /** What Apply changes: the selection against `output`, or `output` added. */
  diff(output: string): DiffHunk[] {
    return this.inserts
      ? [{ kind: 'added', lines: output.split('\n') }]
      : lineDiff(this.selection.text, output);
  }

  profiles(): readonly FragmentProfile[] {
    return this.settings.fragmentProfiles;
  }

  /** Why `name` cannot be saved for the profile `id` ('' for a new one), if it cannot. */
  nameRejection(id: string, name: string): string | undefined {
    return profileNameRejection(this.settings.fragmentProfiles, id, name);
  }

  /**
   * Save the template under `name`: renames and updates the profile `id`, or
   * creates a profile when `id` is ''. Returns the saved profile.
   */
  async saveProfile(
    id: string,
    name: string,
    template: string,
  ): Promise<FragmentProfile> {
    const rejection = this.nameRejection(id, name);
    if (rejection !== undefined) throw new Error(rejection);
    let saved: FragmentProfile;
    if (id === '') {
      saved = createProfile(name, template);
      this.settings.fragmentProfiles = addProfile(
        this.settings.fragmentProfiles,
        saved,
      );
    } else {
      this.settings.fragmentProfiles = updateProfile(
        this.settings.fragmentProfiles,
        id,
        name,
        template,
      );
      saved = { id, name: name.trim(), template };
    }
    await this.saveSettings();
    return saved;
  }

  /** Replace the selection in the editor with `text`, or insert it at the cursor. */
  apply(text: string): void {
    this.editor.replaceSelection(text);
  }
}
