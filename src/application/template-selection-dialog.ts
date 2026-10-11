import type { ITemplateService } from '../container';
import type { IContentTemplateResolver } from './content-template-resolver';
import type { IEditorProxy } from '../platform/platform-adapter';
import type { Result, TemplateContext, TemplateRenderError } from '../core';
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
 * Model behind the "Replace selection with template" dialog, bound to one
 * selection in one literature note. It extracts the template part that
 * produced the selection, renders templates with the note's entry, keeps the
 * fragment profiles in the settings, and replaces the selection on apply.
 * Nothing is tracked after apply.
 */

/** Where the dialog was opened: the note, its entry and the selected text. */
export interface TemplateSelection {
  citekey: string;
  filePath: string;
  text: string;
}

/** Opens the dialog. Implemented by the UI layer, so this layer stays free of Obsidian. */
export interface ITemplateSelectionPresenter {
  open(dialog: TemplateSelectionDialog): void;
}

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

  /** Find the part of the template at `templatePath` that produced the selection. */
  async extract(templatePath: string): Promise<TemplateFragmentMatch | null> {
    const template = await this.templateResolver.readTemplate(templatePath);
    return locateTemplateFragment(template, this.selection.text, (source) => {
      const rendered = this.render(source);
      return rendered.ok ? rendered.value : null;
    });
  }

  /** Render a template with the entry of the note. */
  render(template: string): Result<string, TemplateRenderError> {
    return this.templateService.render(template, this.variables);
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

  /** Replace the selection in the editor with `text`. */
  apply(text: string): void {
    this.editor.replaceSelection(text);
  }
}
