import * as path from 'path';
import { CitationsPluginSettings } from '../ui/settings/settings';
import { INoteService, ITemplateService, IPlatformAdapter } from '../container';
import { IVaultFile } from '../platform/platform-adapter';
import type { IBaselineStore } from './baseline-store';
import { NoteLookupIndex } from './note-lookup-index';
import {
  Library,
  LiteratureNoteNotFoundError,
  EntryNotFoundError,
} from '../core';
import type { TemplateContext } from '../core';
import { DISALLOWED_SEGMENT_CHARACTERS_RE } from '../util';

type ContentTemplateResolver = () => Promise<string>;

const MAX_FILENAME_LENGTH = 200;

/** Memoized citekey → note path map, valid for one library + settings pair. */
interface PathCacheEntry {
  /** Title template / folder / sanitization settings the paths derive from. */
  fingerprint: string;
  paths: Map<string, string>;
}

export class NoteService implements INoteService {
  private resolveContentTemplate: ContentTemplateResolver;
  /**
   * Per-library memo for {@link getPathForCitekey}: rendering the title
   * template is the hot inner step of every reverse lookup and batch scan
   * (O(entries × renders) without it). Keyed weakly by the Library object so
   * a reload naturally invalidates; the fingerprint guards settings edits.
   */
  private pathCache = new WeakMap<Library, PathCacheEntry>();

  constructor(
    private platform: IPlatformAdapter,
    private settings: CitationsPluginSettings,
    private templateService: ITemplateService,
    resolveContentTemplate?: ContentTemplateResolver,
    /** Records the rendered content as the sync baseline for new notes. */
    private baselineStore?: IBaselineStore,
  ) {
    this.resolveContentTemplate =
      resolveContentTemplate ?? (() => Promise.resolve(''));
  }

  /**
   * Matches a literal `/` in a Handlebars template that is outside
   * of `{{ }}` expressions — i.e. an intentional path separator.
   */
  private static readonly LITERAL_SLASH_RE = /(?:^|}})[^{]*\/[^{]*(?:{{|$)/;

  /**
   * Sanitize a rendered title for use as a file path.
   *
   * Variable values are always pre-cleaned (slashes replaced with `_`)
   * so that data like "Author A / Author B" never produces subdirectories.
   * If the template itself contains literal `/` separators, the rendered
   * result is split into path segments for subfolder support.
   */
  private sanitizeTitlePath(
    rendered: string,
    hasPathSegments: boolean,
  ): string {
    // Collapse line breaks first: a multi-line render (e.g. a block helper
    // accidentally used in the TITLE template) must never smuggle newlines
    // into a file path — such a path would break note lookup and cause
    // duplicate notes to be created on every sync.
    rendered = rendered.replace(/[\r\n]+/g, ' ');
    if (hasPathSegments) {
      return rendered
        .split('/')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => this.truncateSegment(s))
        .join('/');
    }
    return this.truncateSegment(rendered.trim());
  }

  /** Strip disallowed characters and enforce the filename length limit. */
  private truncateSegment(raw: string): string {
    const replacement = this.settings.filenameSanitizationReplacement;
    let clean = raw.replace(DISALLOWED_SEGMENT_CHARACTERS_RE, replacement);
    if (clean.length > MAX_FILENAME_LENGTH) {
      clean = clean.substring(0, MAX_FILENAME_LENGTH);
    }
    return clean;
  }

  /**
   * Replace `/` in string variable values so that data never introduces
   * unintended path separators. Called before rendering the title template.
   */
  private sanitizeVariablesForPath(
    variables: TemplateContext,
  ): TemplateContext {
    const result: TemplateContext = { ...variables };
    for (const key of Object.keys(result)) {
      const value = (result as unknown as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        (result as unknown as Record<string, unknown>)[key] = value.replace(
          /\//g,
          this.settings.filenameSanitizationReplacement,
        );
      }
    }
    return result;
  }

  /** The settings a memoized note path depends on. */
  private pathFingerprint(): string {
    return [
      this.settings.literatureNoteTitleTemplate,
      this.settings.literatureNoteFolder,
      this.settings.filenameSanitizationReplacement,
    ].join('\u0000');
  }

  /**
   * @throws {TemplateRenderError} when the title template fails to render
   */
  getPathForCitekey(citekey: string, library: Library): string {
    const fingerprint = this.pathFingerprint();
    let cached = this.pathCache.get(library);
    if (!cached || cached.fingerprint !== fingerprint) {
      cached = { fingerprint, paths: new Map() };
      this.pathCache.set(library, cached);
    }
    const memoized = cached.paths.get(citekey);
    if (memoized !== undefined) return memoized;

    const entry = library.entries[citekey];
    if (!entry) {
      throw new EntryNotFoundError(citekey);
    }
    const variables = this.templateService.getTemplateVariables(entry);
    const safeVars = this.sanitizeVariablesForPath(variables);
    const titleResult = this.templateService.getTitle(safeVars);
    if (!titleResult.ok) {
      throw titleResult.error;
    }
    const template = this.settings.literatureNoteTitleTemplate;
    const hasPathSegments = NoteService.LITERAL_SLASH_RE.test(template);
    const title = this.sanitizeTitlePath(titleResult.value, hasPathSegments);
    // Vault paths must always use forward slashes on every OS. Node's
    // platform-specific `path.join` injects backslashes on Windows, which
    // desync note creation (raw path) from lookup (normalized path) and break
    // wiki-links and dedup. `path.posix.join` keeps the separator consistent.
    const notePath = path.posix.join(
      this.settings.literatureNoteFolder,
      `${title}.md`,
    );
    cached.paths.set(citekey, notePath);
    return notePath;
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
   * A lookup index over the current vault snapshot, for passing to repeated
   * {@link findExistingLiteratureNoteFile} calls (e.g. a batch update) so
   * the fallback scans are shared instead of re-run per citekey.
   */
  createNoteLookupIndex(): NoteLookupIndex {
    return new NoteLookupIndex(this.platform);
  }

  /**
   * First file with the given basename under `rootFolder` ('' = whole
   * vault), matching case-insensitively. Handles notes the user moved into
   * a different subfolder — found instead of duplicated.
   */
  private findNoteInSubfolders(
    expectedBasename: string,
    rootFolder: string,
    index: NoteLookupIndex,
  ): IVaultFile | null {
    const normalizedRoot = this.platform
      .normalizePath(rootFolder)
      .toLowerCase();

    for (const file of index.byBasename(expectedBasename.toLowerCase())) {
      const inFolder =
        normalizedRoot === ''
          ? true
          : file.path.toLowerCase().startsWith(normalizedRoot + '/') ||
            file.path.toLowerCase() === normalizedRoot;
      if (inFolder) return file;
    }
    return null;
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
    const created = await this.platform.vault.create(
      notePath,
      contentResult.value,
    );
    // Best-effort: the baseline lets later updates tell user edits apart
    // from library changes from the very first sync. recordFromRender only
    // mutates the in-memory map, so flush it to disk here — unlike the batch
    // orchestrator, note creation has no later flush to piggyback on.
    try {
      await this.baselineStore?.recordFromRender(
        citekey,
        contentResult.value,
        created.path,
      );
      await this.baselineStore?.flush();
    } catch (e) {
      console.warn('Citations: could not record note baseline', e);
    }
    return created;
  }

  /**
   * Looks up an existing literature note file without creating one.
   * Returns null when the note does not exist in the vault.
   *
   * Repeated callers (batch updates, reverse lookups) should create ONE
   * index via {@link createNoteLookupIndex} and pass it to every call; the
   * fallback scans below then cost one vault pass total instead of one per
   * citekey.
   *
   * @throws {TemplateRenderError} when the title template fails to render
   */
  findExistingLiteratureNoteFile(
    citekey: string,
    library: Library,
    index: NoteLookupIndex = this.createNoteLookupIndex(),
  ): IVaultFile | null {
    const notePath = this.getPathForCitekey(citekey, library);
    const normalizedPath = this.platform.normalizePath(notePath);

    const file = this.platform.vault.getAbstractFileByPath(normalizedPath);
    if (file && this.platform.vault.isFile(file)) {
      return file;
    }

    const caseInsensitive = index.byLowerPath(normalizedPath.toLowerCase());
    if (caseInsensitive) {
      return caseInsensitive;
    }

    // Basename search: look for a file with the same basename anywhere
    // under the literature note folder (handles manually moved notes)
    const expectedBasename = path.basename(notePath);
    const found = this.findNoteInSubfolders(
      expectedBasename,
      this.settings.literatureNoteFolder,
      index,
    );
    if (found) {
      return found;
    }

    // Vault-wide search: look for the file anywhere in the vault (#256).
    // This handles notes moved completely outside the literature note folder.
    const vaultWide = this.findNoteInSubfolders(expectedBasename, '', index);
    if (vaultWide) {
      console.warn(
        `Citations: note "${expectedBasename}" found outside the literature note folder at "${vaultWide.path}". Using vault-wide match.`,
      );
      return vaultWide;
    }

    // Frontmatter-based lookup (#53): when a noteIdentifierField is
    // configured, scan all markdown files for a frontmatter field whose
    // value matches the target citekey.  This handles notes that were
    // renamed by the user.
    const identifierField = this.settings.noteIdentifierField;
    if (identifierField) {
      const byFrontmatter = index.byIdentifier(identifierField, citekey);
      if (byFrontmatter) {
        console.debug(
          `Citations: note for "${citekey}" found via frontmatter field "${identifierField}" at "${byFrontmatter.path}".`,
        );
        return byFrontmatter;
      }
    }

    return null;
  }

  /**
   * Reverse lookup: find the library citekey that a vault file belongs to.
   *
   * Resolution order mirrors {@link findExistingLiteratureNoteFile}:
   * 1. The configured frontmatter identifier field, when set.
   * 2. Exact rendered-title path match against every library entry.
   * 3. Basename match (handles notes moved to another folder), accepted only
   *    when unambiguous.
   *
   * Returns null when the file cannot be matched to any entry.
   *
   * @throws {TemplateRenderError} when the title template fails to render
   */
  findCitekeyForFile(file: IVaultFile, library: Library): string | null {
    const identifierField = this.settings.noteIdentifierField;
    if (identifierField) {
      const fm = this.platform.vault.getFrontmatter(file);
      const value = fm?.[identifierField];
      if (
        value != null &&
        (typeof value === 'string' || typeof value === 'number') &&
        library.entries[String(value)]
      ) {
        return String(value);
      }
    }

    const filePath = this.platform.normalizePath(file.path).toLowerCase();
    const fileName = file.name.toLowerCase();
    const basenameMatches: string[] = [];

    for (const citekey of Object.keys(library.entries)) {
      const notePath = this.platform
        .normalizePath(this.getPathForCitekey(citekey, library))
        .toLowerCase();
      if (notePath === filePath) {
        return citekey;
      }
      if (path.posix.basename(notePath) === fileName) {
        basenameMatches.push(citekey);
      }
    }

    return basenameMatches.length === 1 ? basenameMatches[0] : null;
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
