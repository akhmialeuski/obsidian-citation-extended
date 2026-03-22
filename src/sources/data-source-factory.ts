import { DataSource, DataSourceDefinition } from '../data-source';
import { IDataSourceRegistry } from './data-source-registry';

export interface IDataSourceFactory {
  create(def: DataSourceDefinition, id: string): DataSource;
}

/**
 * Delegates data source creation to a {@link IDataSourceRegistry}.
 *
 * Replaces the former exhaustive switch — new source types are registered
 * in the registry at startup rather than hard-coded here.
 */
export class DataSourceFactory implements IDataSourceFactory {
  constructor(private registry: IDataSourceRegistry) {}

  create(def: DataSourceDefinition, id: string): DataSource {
    return this.registry.create(def, id);
  }
}
