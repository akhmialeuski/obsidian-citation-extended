import { Entry, TemplateContext, Result, TemplateRenderError } from './core';
import { Library } from './core';
import { LibraryState } from './library/library-state';
import type { IVaultFile } from './platform/platform-adapter';
import { SearchService } from './search/search.service';
import {
  IntrospectionService,
  VariableDefinition,
} from './template/introspection.service';
import { StoreSubscriber } from './library/library-store';

// ---------------------------------------------------------------------------
// Minimal store contract exposed through service interfaces
// ---------------------------------------------------------------------------

/** Read-only store contract exposed to consumers that need reactive library state. */
export interface ILibraryStore {
  subscribe(fn: StoreSubscriber<LibraryState>): () => void;
  getState(): LibraryState;
}

// ---------------------------------------------------------------------------
// Service interfaces -- allow the UI layer to depend on abstractions
// ---------------------------------------------------------------------------

/** Handlebars-based template compilation, rendering, and validation. */
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
  getMarkdownCitation(
    variables: TemplateContext,
    alternative?: boolean,
  ): Result<string, TemplateRenderError>;
  validate(templateStr: string): Result<void, TemplateRenderError>;
}

/** Literature note CRUD — path resolution, lookup, creation, and opening. */
export interface INoteService {
  getPathForCitekey(citekey: string, library: Library): string;
  findExistingLiteratureNoteFile(
    citekey: string,
    library: Library,
  ): IVaultFile | null;
  getOrCreateLiteratureNoteFile(
    citekey: string,
    library: Library,
    selectedText?: string,
  ): Promise<IVaultFile>;
  openLiteratureNote(
    citekey: string,
    library: Library,
    newPane: boolean,
    selectedText?: string,
  ): Promise<void>;
}

/** Orchestrates bibliography loading, data-source management, and search indexing. */
export interface ILibraryService {
  readonly library: Library | null;
  readonly state: LibraryState;
  readonly isLibraryLoading: boolean;
  readonly searchService: SearchService;
  readonly introspectionService: IntrospectionService;
  readonly store: ILibraryStore;

  load(isRetry?: boolean): Promise<Library | null>;
  dispose(): void;
  resolveLibraryPath(rawPath: string): string;
  getTemplateVariables(): VariableDefinition[];
  initWatcher(): void;
}

/** Manages Obsidian commands, hotkeys, and status-bar widgets for the plugin. */
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
// Application services re-export
// ---------------------------------------------------------------------------

export type { ICitationService } from './application/citation.service';
export type { IContentTemplateResolver } from './application/content-template-resolver';

// ---------------------------------------------------------------------------
// Data source registry re-export
// ---------------------------------------------------------------------------

export type { IDataSourceRegistry } from './sources/data-source-registry';

// ---------------------------------------------------------------------------
// Batch note update re-export
// ---------------------------------------------------------------------------

export type {
  IBatchNoteOrchestrator,
  BatchUpdateRequest,
  BatchUpdateResult,
  BatchUpdateProgress,
} from './notes/batch/batch-update.types';
