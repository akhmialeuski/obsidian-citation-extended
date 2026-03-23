import * as path from 'path';
import { CitationsPluginSettings } from '../ui/settings/settings';
import { INoteService, ITemplateService, IPlatformAdapter } from '../container';
import { IVaultFile } from '../platform/platform-adapter';
import { Library, LiteratureNoteNotFoundError } from '../core';
import { DISALLOWED_SEGMENT_CHARACTERS_RE } from '../util';

type ContentTemplateResolver = () => Promise<string>;

const MAX_FILENAME_LENGTH = 200;

export class NoteService implements INoteService {
  private resolveContentTemplate: ContentTemplateResolver;

  constructor(
    private platform: IPlatformAdapter,
    private settings: CitationsPluginSettings,
    private templateService: ITemplateService,
    resolveContentTemplate?: ContentTemplateResolver,
  ) {
    this.resolveContentTemplate =
      resolveContentTemplate ?? (() => Promise.resolve(''));
  }

  /**
   * Sanitize each segment of a rendered title independently.
   *
   * Forward slashes inside the title are treated as subfolder separators,
   * allowing templates like `{{containerTitle}}/{{citekey}}` to produce
   * nested paths.  Each individual segment is stripped of disallowed
   * characters and truncated to {@link MAX_FILENAME_LENGTH}.
   * Empty / whitespace-only segments are removed so stray slashes don't
   * produce blank folder names.
   */
  private sanitizeTitlePath(rawTitle: string): string {
    return rawTitle
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .map((segment) => {
        let clean = segment.replace(DISALLOWED_SEGMENT_CHARACTERS_RE, '_');
        if (clean.length > MAX_FILENAME_LENGTH) {
          clean = clean.substring(0, MAX_FILENAME_LENGTH);
        }
        return clean;
      })
      .join('/');
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
    const title = this.sanitizeTitlePath(titleResult.value);
    return path.join(this.settings.literatureNoteFolder, `${title}.md`);
  }

  /**
   * Ensure that a (possibly nested) folder path exists, creating any
   * missing ancestors along the way.  Obsidian's `vault.createFolder`
   * does not recursively create parent directories, so we walk up the
   * path and create each level in order.
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath || folderPath === '/' || folderPath === '.') return;

    const normalized = this.platform.normalizePath(folderPath);
    const existing = this.platform.vault.getAbstractFileByPath(normalized);
    if (existing && this.platform.vault.isFolder(normalized)) return;
    if (existing) return; // Path exists but is a file — let vault.create handle the error

    // Recursively ensure parent folders exist first
    const parent = path.dirname(normalized);
    if (parent && parent !== normalized && parent !== '.' && parent !== '/') {
      await this.ensureFolderExists(parent);
    }

    try {
      await this.platform.vault.createFolder(normalized);
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
   * Search recursively within the literature note folder for a markdown
   * file whose basename matches the expected filename (case-insensitive).
   *
   * This handles the scenario where a user has manually moved a literature
   * note into a different subfolder — the plugin will still find it
   * rather than creating a duplicate.
   */
  private findNoteInSubfolders(
    expectedBasename: string,
    rootFolder: string,
  ): IVaultFile | null {
    const normalizedRoot = this.platform
      .normalizePath(rootFolder)
      .toLowerCase();
    const normalizedBasename = expectedBasename.toLowerCase();

    const matches = this.platform.vault.getMarkdownFiles().filter((f) => {
      const inFolder =
        normalizedRoot === ''
          ? true
          : f.path.toLowerCase().startsWith(normalizedRoot + '/') ||
            f.path.toLowerCase() === normalizedRoot;
      return inFolder && f.name.toLowerCase() === normalizedBasename;
    });

    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * @throws {TemplateRenderError} when the title or content template fails to render
   */
  async getOrCreateLiteratureNoteFile(
    citekey: string,
    library: Library,
    selectedText?: string,
  ): Promise<IVaultFile> {
    const existing = this.findExistingLiteratureNoteFile(citekey, library);
    if (existing) {
      return existing;
    }

    const notePath = this.getPathForCitekey(citekey, library);
    const folder = path.dirname(notePath);
    await this.ensureFolderExists(folder);

    const entry = library.entries[citekey];
    const variables = this.templateService.getTemplateVariables(entry, {
      selectedText,
    });
    const templateStr = await this.resolveContentTemplate();
    const contentResult = this.templateService.render(templateStr, variables);
    if (!contentResult.ok) {
      throw contentResult.error;
    }
    return this.platform.vault.create(notePath, contentResult.value);
  }

  /**
   * Looks up an existing literature note file without creating one.
   * Returns null when the note does not exist in the vault.
   *
   * @throws {TemplateRenderError} when the title template fails to render
   */
  findExistingLiteratureNoteFile(
    citekey: string,
    library: Library,
  ): IVaultFile | null {
    const notePath = this.getPathForCitekey(citekey, library);
    const normalizedPath = this.platform.normalizePath(notePath);

    const file = this.platform.vault.getAbstractFileByPath(normalizedPath);
    if (file && this.platform.vault.isFile(file)) {
      return file;
    }

    const matches = this.platform.vault
      .getMarkdownFiles()
      .filter((f) => f.path.toLowerCase() === normalizedPath.toLowerCase());
    if (matches.length > 0) {
      return matches[0];
    }

    // Recursive search: look for a file with the same basename anywhere
    // under the literature note folder (handles manually moved notes)
    const expectedBasename = path.basename(notePath);
    const found = this.findNoteInSubfolders(
      expectedBasename,
      this.settings.literatureNoteFolder,
    );
    if (found) {
      return found;
    }

    // Vault-wide search: look for the file anywhere in the vault (#256).
    // This handles notes moved completely outside the literature note folder.
    const vaultWide = this.findNoteInSubfolders(expectedBasename, '');
    if (vaultWide) {
      return vaultWide;
    }

    return null;
  }

  /**
   * @throws {LiteratureNoteNotFoundError} when auto-creation is disabled and note does not exist
   * @throws {TemplateRenderError} when the title or content template fails to render
   */
  async openLiteratureNote(
    citekey: string,
    library: Library,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void> {
    let file: IVaultFile;

    if (this.settings.disableAutomaticNoteCreation) {
      const existing = this.findExistingLiteratureNoteFile(citekey, library);
      if (!existing) {
        throw new LiteratureNoteNotFoundError(citekey);
      }
      file = existing;
    } else {
      file = await this.getOrCreateLiteratureNoteFile(
        citekey,
        library,
        selectedText,
      );
    }

    await this.platform.workspace.openFile(file, newPane);
  }
}
