import { Entry, TemplateContext, Result, TemplateRenderError } from './core';
import { Library } from './core';
import { TFile } from 'obsidian';
import { LibraryState } from './library/library-state';
import { DataSource } from './data-source';
import { SearchService } from './search/search.service';
import {
  IntrospectionService,
  VariableDefinition,
} from './template/introspection.service';
import { StoreSubscriber } from './library/library-store';

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
  getTemplateVariables(
    entry: Entry,
    extras?: { selectedText?: string },
  ): TemplateContext;
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
  getPathForCitekey(citekey: string, library: Library): string;
  findExistingLiteratureNoteFile(
    citekey: string,
    library: Library,
  ): TFile | null;
  getOrCreateLiteratureNoteFile(
    citekey: string,
    library: Library,
    selectedText?: string,
  ): Promise<TFile>;
  openLiteratureNote(
    citekey: string,
    library: Library,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void>;
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

// ---------------------------------------------------------------------------
// Platform adapter re-export for convenience
// ---------------------------------------------------------------------------

export type {
  IPlatformAdapter,
  IFileSystem,
  IVaultAccess,
  IVaultFile,
  IWorkspaceAccess,
  IEditorProxy,
  IEditorPosition,
  INotificationService,
  IStatusBarItem,
} from './platform/platform-adapter';

// ---------------------------------------------------------------------------
// Data source registry re-export
// ---------------------------------------------------------------------------

export type { IDataSourceRegistry } from './sources/data-source-registry';
