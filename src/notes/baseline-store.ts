import type { IFileSystem } from '../platform/platform-adapter';
import type { NoteBaseline } from '../core';
import { baselineFromRender } from '../core';

/**
 * Persistent store of per-note baselines (the last content the plugin
 * rendered for each citekey). Baselines power the three-way merge: they let
 * the sync planner tell user edits apart from library changes.
 *
 * Storage: one JSON file in the plugin directory mapping citekey → baseline.
 * All operations are best-effort — a missing or corrupt store degrades to
 * "no baseline" (first-sync semantics), never to an error.
 *
 * Writes are decoupled from mutation: {@link set}/{@link recordFromRender}
 * update the in-memory map and mark it dirty; the caller persists once via
 * {@link flush}. This avoids re-serializing the whole map after every note in
 * a batch (which would be O(N²) writes). Concurrent first-loads share a single
 * in-flight read so an empty snapshot can never overwrite the file on disk.
 */
export interface IBaselineStore {
  /** Baseline for a citekey, or null when none was recorded. */
  get(citekey: string): Promise<NoteBaseline | null>;
  /** Record the baseline in memory (persist later with {@link flush}). */
  set(citekey: string, baseline: NoteBaseline): Promise<void>;
  /** Record a baseline directly from freshly rendered note content. */
  recordFromRender(citekey: string, rendered: string): Promise<void>;
  /** Persist pending changes to disk (no-op when nothing changed). */
  flush(): Promise<void>;
}

interface BaselineFileV1 {
  version: 1;
  baselines: Record<string, NoteBaseline>;
}

export class BaselineStore implements IBaselineStore {
  private cache: Record<string, NoteBaseline> | null = null;
  /** In-flight load, shared by concurrent callers to avoid a torn snapshot. */
  private loading: Promise<Record<string, NoteBaseline>> | null = null;
  private dirty = false;

  constructor(
    private fileSystem: IFileSystem | undefined,
    private filePath: string,
  ) {}

  async get(citekey: string): Promise<NoteBaseline | null> {
    const all = await this.load();
    return all[citekey] ?? null;
  }

  async set(citekey: string, baseline: NoteBaseline): Promise<void> {
    const all = await this.load();
    all[citekey] = baseline;
    this.dirty = true;
  }

  async recordFromRender(citekey: string, rendered: string): Promise<void> {
    await this.set(citekey, baselineFromRender(rendered));
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    const all = await this.load();
    this.dirty = false;
    if (!this.fileSystem || !this.filePath) return;
    try {
      await this.fileSystem.writeFile(
        this.filePath,
        JSON.stringify({ version: 1, baselines: all } satisfies BaselineFileV1),
      );
    } catch (e) {
      // Re-mark dirty so a later flush can retry.
      this.dirty = true;
      console.warn('Citations: could not persist note baselines', e);
    }
  }

  /**
   * Load the baseline map, memoizing the in-flight read so a second caller
   * that arrives mid-load awaits the SAME promise instead of seeing an empty
   * map (which would then be persisted over the real on-disk data).
   */
  private load(): Promise<Record<string, NoteBaseline>> {
    if (this.cache) return Promise.resolve(this.cache);
    if (this.loading) return this.loading;
    this.loading = this.readFromDisk()
      .then((loaded) => {
        this.cache = loaded;
        return loaded;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  private async readFromDisk(): Promise<Record<string, NoteBaseline>> {
    if (!this.fileSystem || !this.filePath) return {};
    try {
      if (await this.fileSystem.exists(this.filePath)) {
        const parsed: unknown = JSON.parse(
          await this.fileSystem.readFile(this.filePath),
        );
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          (parsed as BaselineFileV1).version === 1 &&
          typeof (parsed as BaselineFileV1).baselines === 'object'
        ) {
          return (parsed as BaselineFileV1).baselines ?? {};
        }
      }
    } catch (e) {
      console.warn(
        'Citations: could not read note baselines, starting fresh',
        e,
      );
    }
    return {};
  }
}
