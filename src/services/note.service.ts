import { App, TFile, normalizePath } from 'obsidian';
import * as path from 'path';
import { CitationsPluginSettings } from '../settings';
import { ITemplateService } from '../container';
import { Library } from '../types';
import { DISALLOWED_FILENAME_CHARACTERS_RE, Notifier } from '../util';

export class NoteService {
  literatureNoteErrorNotifier = new Notifier(
    'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
  );

  constructor(
    private app: App,
    private settings: CitationsPluginSettings,
    private templateService: ITemplateService,
  ) {}

  /**
   * @throws {TemplateRenderError} when the title template fails to render
   */
  getPathForCitekey(citekey: string, library: Library): string {
    const entry = library.entries[citekey];
    const variables = this.templateService.getTemplateVariables(entry);
    const titleResult = this.templateService.getTitle(variables);
    if (!titleResult.ok) {
      throw titleResult.error;
    }
    const title = titleResult.value.replace(
      DISALLOWED_FILENAME_CHARACTERS_RE,
      '_',
    );
    return path.join(this.settings.literatureNoteFolder, `${title}.md`);
  }

  /**
   * @throws {TemplateRenderError} when the title or content template fails to render
   */
  async getOrCreateLiteratureNoteFile(
    citekey: string,
    library: Library,
  ): Promise<TFile> {
    const notePath = this.getPathForCitekey(citekey, library);
    const normalizedPath = normalizePath(notePath);

    let file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (file == null) {
      const matches = this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.toLowerCase() == normalizedPath.toLowerCase());
      if (matches.length > 0) {
        file = matches[0];
      } else {
        try {
          const entry = library.entries[citekey];
          const variables = this.templateService.getTemplateVariables(entry);
          const contentResult = this.templateService.getContent(variables);
          if (!contentResult.ok) {
            throw contentResult.error;
          }
          file = await this.app.vault.create(notePath, contentResult.value);
        } catch (exc) {
          this.literatureNoteErrorNotifier.show();
          throw exc;
        }
      }
    }

    if (file instanceof TFile) {
      return file;
    }
    throw new Error(`File at ${notePath} is not a TFile`);
  }

  openLiteratureNote(
    citekey: string,
    library: Library,
    newPane: boolean,
  ): Promise<void> {
    return this.getOrCreateLiteratureNoteFile(citekey, library)
      .then(async (file: TFile) => {
        await this.app.workspace.getLeaf(newPane).openFile(file);
      })
      .catch(console.error);
  }
}
