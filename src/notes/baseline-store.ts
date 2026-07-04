import type { IFileSystem } from '../platform/platform-adapter';
import type { NoteBaseline } from '../core';
import { baselineFromRender } from '../core';

/**
 * Persistent store of per-note baselines (the last content the plugin
 * rendered for each citekey). Baselines power the three-way merge: they let
 * the sync planner tell user edits apart from library changes.
 *
 * Storage: one JSON file in the plugin directory mapping citekey → baseline.
 * A missing or unreadable store degrades to "no baseline" (first-sync
 * semantics), never to an error.
 *
 * Data-protection invariants (the baselines are the merge safety net, so the
 * store must never destroy them):
 *
 * - **Per-key dirty tracking + merge-on-flush.** {@link set} and
 *   {@link recordFromRender} only mutate the in-memory map and mark that KEY
 *   dirty; {@link flush} re-reads the file and overlays only the dirty keys
 *   before writing. A whole-map overwrite would clobber baselines another
 *   device advanced in a folder-synced vault (iCloud/Syncthing/git), which
 *   later makes user edits look untouched and silently overwritable.
 * - **Never persist over a file we could not read.** If the file exists but
 *   is unreadable/corrupt, it is backed up (`<path>.corrupt`) before the
 *   first write; if it was written by a NEWER plugin version, the store goes
 *   read-only for the session rather than downgrade-destroying it.
 * - Concurrent first-loads share one in-flight read so an empty snapshot can
 *   never be cached over real data.
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

/** Result of a disk read, distinguishing "no data" from "unreadable data". */
interface DiskRead {
  baselines: Record<string, NoteBaseline>;
  /** 'ok' — usable (possibly absent) file; 'corrupt' — exists but unreadable;
   *  'newer' — written by a newer plugin version (never overwrite). */
  state: 'ok' | 'corrupt' | 'newer';
}

export class BaselineStore implements IBaselineStore {
  private cache: Record<string, NoteBaseline> | null = null;
  /** In-flight load, shared by concurrent callers to avoid a torn snapshot. */
  private loading: Promise<Record<string, NoteBaseline>> | null = null;
  /** Citekeys whose in-memory baseline differs from what disk last held. */
  private dirtyKeys = new Set<string>();
  /** Sticky read-only marker: the file belongs to a newer plugin version. */
  private newerVersionOnDisk = false;
  /** The initial load found an unreadable file — back it up before writing. */
  private corruptOnDisk = false;

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
    this.dirtyKeys.add(citekey);
  }

  async recordFromRender(citekey: string, rendered: string): Promise<void> {
    await this.set(citekey, baselineFromRender(rendered));
  }

  async flush(): Promise<void> {
    if (this.dirtyKeys.size === 0) return;
    if (!this.fileSystem || !this.filePath) return;
    if (this.newerVersionOnDisk) {
      console.warn(
        'Citations: note-baselines.json was written by a newer plugin version — not overwriting it.',
      );
      return;
    }

    const cache = await this.load();
    // Swap the dirty set so keys marked during the awaits below are kept for
    // the next flush instead of being silently cleared.
    const pending = this.dirtyKeys;
    this.dirtyKeys = new Set<string>();

    try {
      // Merge-on-flush: re-read the file and overlay ONLY our dirty keys, so
      // baselines advanced by another device/process are preserved instead of
      // being clobbered by this session's stale in-memory map.
      const disk = await this.readFromDisk();
      if (disk.state === 'newer') {
        this.newerVersionOnDisk = true;
        for (const key of pending) this.dirtyKeys.add(key);
        console.warn(
          'Citations: note-baselines.json was written by a newer plugin version — not overwriting it.',
        );
        return;
      }
      if (disk.state === 'corrupt' || this.corruptOnDisk) {
        await this.backupCorruptFile();
        this.corruptOnDisk = false;
      }

      const merged: Record<string, NoteBaseline> =
        disk.state === 'ok' ? { ...disk.baselines } : {};
      for (const key of pending) {
        if (cache[key] !== undefined) merged[key] = cache[key];
      }
      // Adopt merged as the session cache so later reads see the other
      // device's baselines too (plus our own pending entries).
      for (const [key, value] of Object.entries(merged)) cache[key] = value;

      await this.fileSystem.writeFile(
        this.filePath,
        JSON.stringify({
          version: 1,
          baselines: merged,
        } satisfies BaselineFileV1),
      );
    } catch (e) {
      // Keep the keys dirty so a later flush can retry.
      for (const key of pending) this.dirtyKeys.add(key);
      console.warn('Citations: could not persist note baselines', e);
    }
  }

  /**
   * Preserve an unreadable baselines file before the first overwrite: the
   * "corruption" may be a sync-tool placeholder for a perfectly good file,
   * and the merge history it holds cannot be regenerated.
   */
  private async backupCorruptFile(): Promise<void> {
    if (!this.fileSystem || !this.filePath) return;
    try {
      const raw = await this.fileSystem.readFile(this.filePath);
      await this.fileSystem.writeFile(`${this.filePath}.corrupt`, raw);
    } catch {
      // Unreadable even as raw bytes — nothing more we can preserve.
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
      .then((read) => {
        if (read.state === 'newer') this.newerVersionOnDisk = true;
        if (read.state === 'corrupt') this.corruptOnDisk = true;
        this.cache = read.baselines;
        return read.baselines;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  private async readFromDisk(): Promise<DiskRead> {
    if (!this.fileSystem || !this.filePath) {
      return { baselines: {}, state: 'ok' };
    }
    try {
      if (!(await this.fileSystem.exists(this.filePath))) {
        return { baselines: {}, state: 'ok' };
      }
      const parsed: unknown = JSON.parse(
        await this.fileSystem.readFile(this.filePath),
      );
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed as BaselineFileV1).version === 1 &&
        typeof (parsed as BaselineFileV1).baselines === 'object'
      ) {
        return {
          baselines: (parsed as BaselineFileV1).baselines ?? {},
          state: 'ok',
        };
      }
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as { version?: unknown }).version === 'number' &&
        (parsed as { version: number }).version > 1
      ) {
        console.warn(
          'Citations: note-baselines.json has a newer format version — treating the store as read-only.',
        );
        return { baselines: {}, state: 'newer' };
      }
      console.warn(
        'Citations: note-baselines.json has an unrecognized shape — starting fresh (the file will be backed up before the next write)',
      );
      return { baselines: {}, state: 'corrupt' };
    } catch (e) {
      console.warn(
        'Citations: could not read note baselines — starting fresh (the file will be backed up before the next write)',
        e,
      );
      return { baselines: {}, state: 'corrupt' };
    }
  }
}
