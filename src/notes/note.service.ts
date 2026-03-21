import { App, TFile, TFolder, normalizePath } from 'obsidian';
import * as path from 'path';
import { CitationsPluginSettings } from '../ui/settings/settings';
import { INoteService, ITemplateService } from '../container';
import { Library } from '../core';
import { DISALLOWED_FILENAME_CHARACTERS_RE } from '../util';

type ContentTemplateResolver = () => Promise<string>;

const MAX_FILENAME_LENGTH = 200;

export class NoteService implements INoteService {
  private resolveContentTemplate: ContentTemplateResolver;

  constructor(
    private app: App,
    private settings: CitationsPluginSettings,
    private templateService: ITemplateService,
    resolveContentTemplate?: ContentTemplateResolver,
  ) {
    this.resolveContentTemplate =
      resolveContentTemplate ??
      (() => Promise.resolve(this.settings.literatureNoteContentTemplate));
  }

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
    let title = titleResult.value.replace(
      DISALLOWED_FILENAME_CHARACTERS_RE,
      '_',
    );
    // Truncate filename to avoid OS path length limits
    if (title.length > MAX_FILENAME_LENGTH) {
      title = title.substring(0, MAX_FILENAME_LENGTH);
    }
    return path.join(this.settings.literatureNoteFolder, `${title}.md`);
  }

  /**
   * Ensure the literature note folder exists, creating it if necessary.
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath || folderPath === '/' || folderPath === '.') return;

    const normalized = normalizePath(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) return;
    if (existing) return; // Path exists but is a file — let vault.create handle the error

    try {
      await this.app.vault.createFolder(normalized);
    } catch (e) {
      // createFolder throws if the folder already exists (concurrent creation).
      // Log unexpected errors but don't block note creation.
      const msg = (e as Error).message || '';
      if (!msg.includes('Folder already exists')) {
        console.warn('Citations: could not create folder:', normalized, e);
      }
    }
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
        // Ensure the target folder exists before creating the note
        const folder = path.dirname(notePath);
        await this.ensureFolderExists(folder);

        const entry = library.entries[citekey];
        const variables = this.templateService.getTemplateVariables(entry);
        const templateStr = await this.resolveContentTemplate();
        const contentResult = this.templateService.render(
          templateStr,
          variables,
        );
        if (!contentResult.ok) {
          throw contentResult.error;
        }
        file = await this.app.vault.create(notePath, contentResult.value);
      }
    }

    if (file instanceof TFile) {
      return file;
    }
    throw new Error(`File at ${notePath} is not a TFile`);
  }

  async openLiteratureNote(
    citekey: string,
    library: Library,
    newPane: boolean,
  ): Promise<void> {
    const file = await this.getOrCreateLiteratureNoteFile(citekey, library);
    await this.app.workspace.getLeaf(newPane).openFile(file);
  }
}
