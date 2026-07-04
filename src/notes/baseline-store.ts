import type { IFileSystem } from '../platform/platform-adapter';
import type { NoteBaseline } from '../core';
import { parseSyncBlocks, splitFrontmatter, syncFrontmatter } from '../core';

/**
 * Persistent store of per-note baselines (the last content the plugin
 * rendered for each citekey). Baselines power the three-way merge: they let
 * the sync planner tell user edits apart from library changes.
 *
 * Storage: one JSON file in the plugin directory mapping citekey → baseline.
 * All operations are best-effort — a missing or corrupt store degrades to
 * "no baseline" (first-sync semantics), never to an error.
 */
export interface IBaselineStore {
  /** Baseline for a citekey, or null when none was recorded. */
  get(citekey: string): Promise<NoteBaseline | null>;
  /** Record the baseline after a successful write. */
  set(citekey: string, baseline: NoteBaseline): Promise<void>;
  /** Record a baseline directly from freshly rendered note content. */
  recordFromRender(citekey: string, rendered: string): Promise<void>;
}

interface BaselineFileV1 {
  version: 1;
  baselines: Record<string, NoteBaseline>;
}

export class BaselineStore implements IBaselineStore {
  private cache: Record<string, NoteBaseline> | null = null;

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
    await this.save(all);
  }

  async recordFromRender(citekey: string, rendered: string): Promise<void> {
    const { frontmatter } = splitFrontmatter(rendered);
    const fm = syncFrontmatter(frontmatter, [], null);
    const blocks: Record<string, string> = {};
    for (const [name, block] of parseSyncBlocks(rendered)) {
      blocks[name] = block.text;
    }
    await this.set(citekey, { frontmatter: fm.baseline, blocks });
  }

  private async load(): Promise<Record<string, NoteBaseline>> {
    if (this.cache) return this.cache;
    this.cache = {};
    if (!this.fileSystem || !this.filePath) return this.cache;
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
          this.cache = (parsed as BaselineFileV1).baselines ?? {};
        }
      }
    } catch (e) {
      console.warn(
        'Citations: could not read note baselines, starting fresh',
        e,
      );
    }
    return this.cache;
  }

  private async save(all: Record<string, NoteBaseline>): Promise<void> {
    this.cache = all;
    if (!this.fileSystem || !this.filePath) return;
    try {
      await this.fileSystem.writeFile(
        this.filePath,
        JSON.stringify({ version: 1, baselines: all } satisfies BaselineFileV1),
      );
    } catch (e) {
      console.warn('Citations: could not persist note baselines', e);
    }
  }
}
