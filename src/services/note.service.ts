import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import * as path from 'path';
import { CitationsPluginSettings } from '../settings';
import { ITemplateService } from '../container';
import { Library } from '../types';
import { DISALLOWED_FILENAME_CHARACTERS_RE } from '../util';
import { TemplateRenderError } from '../core/errors';

const MAX_FILENAME_LENGTH = 200;

export class NoteService {
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
    let notePath: string;
    try {
      notePath = this.getPathForCitekey(citekey, library);
    } catch (exc) {
      if (exc instanceof TemplateRenderError) {
        new Notice(
          `Citations: Failed to render literature note title template. Check your template syntax. Error: ${exc.message}`,
        );
      }
      throw exc;
    }

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
          // Ensure the target folder exists before creating the note
          const folder = path.dirname(notePath);
          await this.ensureFolderExists(folder);

          const entry = library.entries[citekey];
          const variables = this.templateService.getTemplateVariables(entry);
          const contentResult = this.templateService.getContent(variables);
          if (!contentResult.ok) {
            new Notice(
              `Citations: Failed to render literature note content template. Error: ${contentResult.error.message}`,
            );
            throw contentResult.error;
          }
          file = await this.app.vault.create(notePath, contentResult.value);
        } catch (exc) {
          if (exc instanceof TemplateRenderError) {
            // Already shown a Notice above
          } else {
            const errorMsg = (exc as Error).message || String(exc);
            new Notice(
              `Citations: Unable to create literature note "${path.basename(notePath)}". ${errorMsg}`,
            );
          }
          throw exc;
        }
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
    try {
      const file = await this.getOrCreateLiteratureNoteFile(citekey, library);
      await this.app.workspace.getLeaf(newPane).openFile(file);
    } catch (e) {
      console.error('Failed to open literature note:', e);
    }
  }
}
