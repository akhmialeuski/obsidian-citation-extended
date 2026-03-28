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
 */
export interface NormalizationStep {
  readonly name: string;
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
    // Allow steps that need global knowledge to prepare
    for (const step of this.steps) {
      if ('prepare' in step && typeof step.prepare === 'function') {
        (step as { prepare(results: SourceLoadResult[]): void }).prepare(
          results,
        );
      }
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
 * Replaces the inline `entry._sourceDatabase = dbName` logic.
 */
export class SourceTaggingStep implements NormalizationStep {
  readonly name = 'source-tagging';

  process(entries: Entry[], metadata: SourceMetadata): Entry[] {
    for (const entry of entries) {
      entry._sourceDatabase = metadata.databaseName;
    }
    return entries;
  }
}

/**
 * Creates composite citekeys for entries that appear in multiple sources.
 *
 * When the same citekey exists in more than one source, each gets
 * renamed to `citekey@databaseName` so both coexist in the Library.
 */
export class DeduplicationStep implements NormalizationStep {
  readonly name = 'deduplication';

  /** Counts of each citekey across ALL sources — must be populated before `process`. */
  private citekeyCounts = new Map<string, number>();
  private prepared = false;

  /**
   * Scan all results to count citekey occurrences.
   * Must be called once before the pipeline runs this step.
   */
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
    this.prepared = true;
  }

  process(entries: Entry[], metadata: SourceMetadata): Entry[] {
    if (!this.prepared) {
      return entries;
    }

    for (const entry of entries) {
      if ((this.citekeyCounts.get(entry.id) ?? 0) > 1) {
        const compositeKey = `${entry.id}@${metadata.databaseName}`;
        entry._compositeCitekey = compositeKey;
        entry.id = compositeKey;
      }
    }
    return entries;
  }
}
