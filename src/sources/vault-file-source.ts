import { Vault, EventRef, TFile } from 'obsidian';
import { DataSource, DataSourceLoadResult } from '../data-source';
import { DatabaseType, convertToEntries } from '../core';
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

      const result = await this.loadWorker.post({
        databaseRaw: content,
        databaseType: this.format,
      });

      return {
        sourceId: this.id,
        entries: convertToEntries(this.format, result.entries),
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
   * Watch for file changes using Vault events.
   * Silently idempotent — calling watch() when watchers already exist is a no-op.
   */
  watch(callback: () => void): void {
    if (this.eventRefs.length > 0) return;

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
