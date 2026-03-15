import { FileSystemAdapter, Vault } from 'obsidian';
import { Entry, Library, TemplateContext } from './types';
import { LibraryState } from './library/library-state';
import {
  DataSource,
  DataSourceDefinition,
  DataSourceType,
} from './data-source';
import { DataSourceError, TemplateRenderError } from './core/errors';
import { Result } from './core/result';
import { WorkerManager } from './util';
import { LocalFileSource, VaultFileSource } from './sources';
import { SearchService } from './search/search.service';
import {
  IntrospectionService,
  VariableDefinition,
} from './services/introspection.service';
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
// Service interfaces — allow the UI layer to depend on abstractions
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

// ---------------------------------------------------------------------------
// DataSourceFactory — creates DataSource instances by type
// ---------------------------------------------------------------------------

export interface IDataSourceFactory {
  create(def: DataSourceDefinition, id: string): DataSource;
}

export class DataSourceFactory implements IDataSourceFactory {
  constructor(
    private vaultAdapter: FileSystemAdapter | null,
    private workerManager: WorkerManager,
    private vault: Vault,
  ) {}

  create(def: DataSourceDefinition, id: string): DataSource {
    switch (def.type) {
      case DataSourceType.LocalFile:
        return new LocalFileSource(
          id,
          def.path,
          def.format,
          this.workerManager,
          this.vaultAdapter,
        );
      // TODO: VaultFile sources are not yet wired into plugin initialization;
      // the factory branch exists for future multi-source support.
      case DataSourceType.VaultFile:
        return new VaultFileSource(
          id,
          def.path,
          def.format,
          this.workerManager,
          this.vault,
        );
      default: {
        const exhaustiveCheck: never = def.type;
        throw new DataSourceError(
          `Unknown data source type: ${String(exhaustiveCheck)}`,
        );
      }
    }
  }
}
