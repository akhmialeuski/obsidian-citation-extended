import { FileSystemAdapter, Vault } from 'obsidian';
import {
  DataSource,
  DataSourceDefinition,
  DataSourceType,
} from '../data-source';
import { DataSourceError } from '../core/errors';
import { WorkerManager } from '../util';
import { LocalFileSource } from './local-file-source';
import { VaultFileSource } from './vault-file-source';

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
