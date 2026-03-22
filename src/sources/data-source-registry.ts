import { DataSource, DataSourceDefinition } from '../data-source';
import { DataSourceError } from '../core/errors';

/**
 * Factory function that creates a DataSource from a definition and id.
 */
export type DataSourceCreator = (
  def: DataSourceDefinition,
  id: string,
) => DataSource;

/**
 * Registry for data source types.  Follows the open/closed principle:
 * new source types can be registered without modifying existing code.
 */
export interface IDataSourceRegistry {
  /** Register a creator for the given source type. */
  register(type: string, creator: DataSourceCreator): void;

  /** Create a DataSource using the registered creator for `def.type`. */
  create(def: DataSourceDefinition, id: string): DataSource;

  /** Return all registered type identifiers. */
  getSupportedTypes(): string[];

  /** Check whether a creator has been registered for the given type. */
  has(type: string): boolean;
}

export class DataSourceRegistry implements IDataSourceRegistry {
  private creators = new Map<string, DataSourceCreator>();

  register(type: string, creator: DataSourceCreator): void {
    if (this.creators.has(type)) {
      throw new DataSourceError(
        `Data source type "${type}" is already registered`,
      );
    }
    this.creators.set(type, creator);
  }

  create(def: DataSourceDefinition, id: string): DataSource {
    const creator = this.creators.get(def.type);
    if (!creator) {
      const supported = this.getSupportedTypes().join(', ');
      throw new DataSourceError(
        `Unknown data source type: "${def.type}". Supported types: ${supported}`,
      );
    }
    return creator(def, id);
  }

  getSupportedTypes(): string[] {
    return Array.from(this.creators.keys());
  }

  has(type: string): boolean {
    return this.creators.has(type);
  }
}
