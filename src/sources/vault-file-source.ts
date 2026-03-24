import { Vault, EventRef, TFile } from 'obsidian';
import { DataSource, DataSourceLoadResult } from '../data-source';
import {
  Entry,
  EntryData,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  DatabaseType,
  DATABASE_FORMATS,
  EntryDataBibLaTeX,
  EntryDataCSL,
  WorkerResponse,
  UnsupportedFormatError,
  HayagrivaAdapter,
  HayagrivaEntryData,
} from '../core';
import { WorkerManager } from '../util';

/**
 * VaultFileSource loads bibliography data from a file within the Obsidian vault
 * This is suitable for mobile platforms where direct file system access is limited
 */
export class VaultFileSource implements DataSource {
  private eventRefs: EventRef[] = [];
  private watchCallback: (() => void) | null = null;
  private debounceTimer: number | null = null;

  constructor(
    public readonly id: string,
    private filePath: string,
    private format: DatabaseType,
    private loadWorker: WorkerManager,
    private vault: Vault,
  ) {}

  /**
   * Load entries from the vault file
   */
  async load(): Promise<DataSourceLoadResult> {
    try {
      const file = this.vault.getAbstractFileByPath(this.filePath);

      if (!file || !(file instanceof TFile)) {
        throw new Error(`File not found in vault: ${this.filePath}`);
      }

      const content = await this.vault.read(file);

      if (!content || content.length === 0) {
        throw new Error(`File is empty: ${this.filePath}`);
      }

      const raw = await this.loadWorker.post({
        databaseRaw: content,
        databaseType: this.format,
      });

      // TODO(v0.5.0): Remove backward compatibility shim once all workers return WorkerResponse
      const result: WorkerResponse = Array.isArray(raw)
        ? { entries: raw as EntryData[], parseErrors: [] }
        : raw;

      return {
        sourceId: this.id,
        entries: this.convertToEntries(result.entries),
        modifiedAt: new Date(file.stat.mtime),
        parseErrors: result.parseErrors,
      };
    } catch (error) {
      console.error(
        `VaultFileSource: Error loading from ${this.filePath}:`,
        error,
      );
      throw new Error(
        `Failed to load from ${this.filePath}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Convert EntryData to Entry objects using the appropriate adapter
   */
  private convertToEntries(entries: EntryData[]): Entry[] {
    if (this.format === DATABASE_FORMATS.BibLaTeX) {
      return entries.map(
        (e) => new EntryBibLaTeXAdapter(e as EntryDataBibLaTeX),
      );
    } else if (this.format === DATABASE_FORMATS.CslJson) {
      return entries.map((e) => new EntryCSLAdapter(e as EntryDataCSL));
    } else if (this.format === DATABASE_FORMATS.Hayagriva) {
      return entries.map((e) => {
        const { _hayagrivaCitekey, ...rest } = e as unknown as Record<
          string,
          unknown
        >;
        return new HayagrivaAdapter(
          (_hayagrivaCitekey as string) ?? '',
          rest as HayagrivaEntryData,
        );
      });
    } else {
      throw new UnsupportedFormatError(this.format);
    }
  }

  /**
   * Watch for file changes using Vault events
   */
  watch(callback: () => void): void {
    if (this.eventRefs.length > 0) {
      console.warn(`VaultFileSource: Watcher already exists for ${this.id}`);
      return;
    }

    this.watchCallback = callback;

    // Listen for file modifications
    const modifyRef = this.vault.on('modify', (file) => {
      if (file.path === this.filePath) {
        this.triggerCallbackWithDebounce();
      }
    });

    // Listen for file creation (in case file was deleted and recreated)
    const createRef = this.vault.on('create', (file) => {
      if (file.path === this.filePath) {
        this.triggerCallbackWithDebounce();
      }
    });

    this.eventRefs.push(modifyRef, createRef);
    console.debug(`VaultFileSource: Watching ${this.filePath}`);
  }

  /**
   * Trigger the watch callback with debounce to avoid excessive reloads
   */
  private triggerCallbackWithDebounce(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      if (this.watchCallback) {
        console.debug(
          `VaultFileSource: File changed, triggering reload for ${this.id}`,
        );
        this.watchCallback();
      }
    }, 1000); // 1s debounce
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Unregister vault events
    this.eventRefs.forEach((ref) => {
      this.vault.offref(ref);
    });
    this.eventRefs = [];

    this.watchCallback = null;
    console.debug(`VaultFileSource: Disposed watcher for ${this.id}`);
  }
}
