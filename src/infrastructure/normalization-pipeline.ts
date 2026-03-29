import { Entry, Library } from '../core';

/**
 * Metadata about the source that produced a set of entries.
 * Passed to each normalization step so steps can use source info.
 */
export interface SourceMetadata {
  sourceId: string;
  databaseName: string;
}

/**
 * A single step in the normalization pipeline.
 * Steps are composable and run sequentially on each source's entries.
 * Steps MUST return new arrays/objects — never mutate entries in-place.
 */
export interface NormalizationStep {
  readonly name: string;
  prepare?(results: SourceLoadResult[]): void;
  process(entries: Entry[], metadata: SourceMetadata): Entry[];
}

/**
 * Result from a single source load, enriched with database name.
 */
export interface SourceLoadResult {
  sourceId: string;
  databaseName: string;
  entries: Entry[];
  parseErrors: Array<{ message: string }>;
  modifiedAt?: Date;
}

/**
 * Composable pipeline that normalizes entries from multiple sources
 * into a single Library.
 *
 * Each step runs on every source's entries independently, then all
 * entries are merged into the final Library.
 */
export class NormalizationPipeline {
  private steps: NormalizationStep[] = [];

  addStep(step: NormalizationStep): this {
    this.steps.push(step);
    return this;
  }

  run(results: SourceLoadResult[]): Library {
    for (const step of this.steps) {
      step.prepare?.(results);
    }

    const allEntries = new Map<string, Entry>();

    for (const result of results) {
      const metadata: SourceMetadata = {
        sourceId: result.sourceId,
        databaseName: result.databaseName,
      };

      let entries = result.entries;
      for (const step of this.steps) {
        entries = step.process(entries, metadata);
      }

      for (const entry of entries) {
        allEntries.set(entry.id, entry);
      }
    }

    return new Library(Object.fromEntries(allEntries));
  }
}

/**
 * Tags each entry with the database name it came from.
 * Returns new Entry objects — never mutates the originals.
 */
export class SourceTaggingStep implements NormalizationStep {
  readonly name = 'source-tagging';

  process(entries: Entry[], metadata: SourceMetadata): Entry[] {
    return entries.map((entry) => {
      const tagged = Object.create(
        Object.getPrototypeOf(entry) as object,
      ) as Entry;
      Object.assign(tagged, entry, {
        _sourceDatabase: metadata.databaseName,
      });
      return tagged;
    });
  }
}

/**
 * Creates composite citekeys for entries that appear in multiple sources.
 * Returns new Entry objects — never mutates the originals.
 *
 * When the same citekey exists in more than one source, each gets
 * renamed to `citekey@databaseName` so both coexist in the Library.
 */
export class DeduplicationStep implements NormalizationStep {
  readonly name = 'deduplication';

  private citekeyCounts = new Map<string, number>();

  prepare(results: SourceLoadResult[]): void {
    this.citekeyCounts.clear();
    for (const result of results) {
      for (const entry of result.entries) {
        this.citekeyCounts.set(
          entry.id,
          (this.citekeyCounts.get(entry.id) || 0) + 1,
        );
      }
    }
  }

  process(entries: Entry[], metadata: SourceMetadata): Entry[] {
    return entries.map((entry) => {
      if ((this.citekeyCounts.get(entry.id) ?? 0) > 1) {
        const compositeKey = `${entry.id}@${metadata.databaseName}`;
        const cloned = Object.create(
          Object.getPrototypeOf(entry) as object,
        ) as Entry;
        Object.assign(cloned, entry, {
          id: compositeKey,
          _compositeCitekey: compositeKey,
        });
        return cloned;
      }
      return entry;
    });
  }
}
