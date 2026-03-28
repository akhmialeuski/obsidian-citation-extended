import type { ILibraryService, ITemplateService } from '../container';
import type { IContentTemplateResolver } from './content-template-resolver';
import type { CitationsPluginSettings } from '../ui/settings/settings';
import {
  Entry,
  Result,
  ok,
  err,
  CitationError,
  LibraryNotReadyError,
  EntryNotFoundError,
} from '../core';
import { DISALLOWED_FILENAME_CHARACTERS_RE } from '../util';

/**
 * Application-level service encapsulating all citation business logic.
 *
 * Depends only on service interfaces — never on Obsidian or the plugin class.
 * This is the single source of truth for entry lookup, title rendering,
 * content generation, and citation formatting.
 */
export interface ICitationService {
  getEntry(citekey: string): Result<Entry, CitationError>;

  getTitleForCitekey(citekey: string): Result<string, CitationError>;

  getInitialContentForCitekey(
    citekey: string,
    selectedText?: string,
  ): Promise<Result<string, CitationError>>;

  getMarkdownCitation(
    citekey: string,
    alternative?: boolean,
    selectedText?: string,
  ): Result<string, CitationError>;
}

export class CitationService implements ICitationService {
  constructor(
    private libraryService: ILibraryService,
    private templateService: ITemplateService,
    private contentTemplateResolver: IContentTemplateResolver,
    private settings: CitationsPluginSettings,
  ) {}

  getEntry(citekey: string): Result<Entry, CitationError> {
    const library = this.libraryService.library;
    if (this.libraryService.isLibraryLoading || !library) {
      return err(new LibraryNotReadyError());
    }

    const entry = library.entries[citekey];
    if (!entry) {
      return err(new EntryNotFoundError(citekey));
    }

    return ok(entry);
  }

  getTitleForCitekey(citekey: string): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
    );
    const titleResult = this.templateService.getTitle(variables);
    if (!titleResult.ok) return titleResult;

    return ok(
      titleResult.value.replace(DISALLOWED_FILENAME_CHARACTERS_RE, '_'),
    );
  }

  async getInitialContentForCitekey(
    citekey: string,
    selectedText?: string,
  ): Promise<Result<string, CitationError>> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
      { selectedText },
    );
    const templateStr = await this.contentTemplateResolver.resolve();
    return this.templateService.render(templateStr, variables);
  }

  getMarkdownCitation(
    citekey: string,
    alternative = false,
    selectedText?: string,
  ): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
      { selectedText },
    );
    return this.templateService.getMarkdownCitation(variables, alternative);
  }
}
