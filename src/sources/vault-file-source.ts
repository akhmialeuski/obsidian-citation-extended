import { Vault, EventRef, TFile } from 'obsidian';
import { DataSource } from '../data-source';
import {
  Entry,
  EntryData,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  DatabaseType,
} from '../types';
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
  async load(): Promise<Entry[]> {
    try {
      // Get the file from vault
      const file = this.vault.getAbstractFileByPath(this.filePath);

      if (!file || !(file instanceof TFile)) {
        throw new Error(`File not found in vault: ${this.filePath}`);
      }

      // Read file content
      const content = await this.vault.read(file);

      if (!content || content.length === 0) {
        throw new Error(`File is empty: ${this.filePath}`);
      }

      // Parse using worker
      const entries: EntryData[] = await this.loadWorker.post({
        databaseRaw: content,
        databaseType: this.format,
      });

      // Convert to Entry objects using appropriate adapter
      return this.convertToEntries(entries);
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
    let adapter: new (data: EntryData) => Entry;

    if (this.format === 'biblatex') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adapter = EntryBibLaTeXAdapter as any;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adapter = EntryCSLAdapter as any;
    }

    return entries.map((e) => new adapter(e));
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
