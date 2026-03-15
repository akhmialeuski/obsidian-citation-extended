import {
  Entry,
  Library,
  TemplateContext,
  Result,
  TemplateRenderError,
} from './core';
import { LibraryState } from './library/library-state';
import { DataSource } from './data-source';
import { SearchService } from './search/search.service';
import {
  IntrospectionService,
  VariableDefinition,
} from './template/introspection.service';
import { StoreSubscriber } from './library/library-store';
import { TFile } from 'obsidian';

// ---------------------------------------------------------------------------
// Minimal store contract exposed through service interfaces
// ---------------------------------------------------------------------------

export interface ILibraryStore {
  subscribe(fn: StoreSubscriber<LibraryState>): () => void;
  getState(): LibraryState;
}

// ---------------------------------------------------------------------------
// Service interfaces -- allow the UI layer to depend on abstractions
// ---------------------------------------------------------------------------

export interface ITemplateService {
  getTemplateVariables(entry: Entry): TemplateContext;
  render(
    templateStr: string,
    variables: TemplateContext,
  ): Result<string, TemplateRenderError>;
  getTitle(variables: TemplateContext): Result<string, TemplateRenderError>;
  getContent(variables: TemplateContext): Result<string, TemplateRenderError>;
  getMarkdownCitation(
    variables: TemplateContext,
    alternative?: boolean,
  ): Result<string, TemplateRenderError>;
  validate(templateStr: string): Result<void, TemplateRenderError>;
}

export interface INoteService {
  openLiteratureNote(
    citekey: string,
    library: Library,
    newPane: boolean,
  ): Promise<void>;
  /**
   * @throws {TemplateRenderError} when the title or content template fails to render
   */
  getOrCreateLiteratureNoteFile(
    citekey: string,
    library: Library,
  ): Promise<TFile>;
}

export interface ILibraryService {
  readonly library: Library | null;
  readonly state: LibraryState;
  readonly isLibraryLoading: boolean;
  readonly searchService: SearchService;
  readonly introspectionService: IntrospectionService;
  readonly store: ILibraryStore;

  load(isRetry?: boolean): Promise<Library | null>;
  dispose(): void;
  getSources(): DataSource[];
  addSource(source: DataSource): void;
  removeSource(sourceId: string): void;
  resolveLibraryPath(rawPath: string): string;
  getTemplateVariables(): VariableDefinition[];
  initWatcher(): void;
}

export interface IUIService {
  init(): void;
  dispose(): void;
}
