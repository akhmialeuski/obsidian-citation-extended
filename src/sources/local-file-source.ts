import { FileSystemAdapter } from 'obsidian';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
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
} from '../core';
import { WorkerManager } from '../util';

/**
 * LocalFileSource loads bibliography data from a local file using Node.js fs
 * This is suitable for desktop platforms where file system access is available
 */
export class LocalFileSource implements DataSource {
  private watcher: chokidar.FSWatcher | null = null;
  private watchCallback: (() => void) | null = null;
  private debounceTimer: number | null = null;

  constructor(
    public readonly id: string,
    private filePath: string,
    private format: DatabaseType,
    private loadWorker: WorkerManager,
    private vaultAdapter: FileSystemAdapter | null,
  ) {}

  /**
   * Resolve the file path, allowing for relative paths from vault root
   */
  private resolveFilePath(): string {
    const vaultRoot =
      this.vaultAdapter instanceof FileSystemAdapter
        ? this.vaultAdapter.getBasePath()
        : '/';
    return path.resolve(vaultRoot, this.filePath);
  }

  /**
   * Load entries from the local file
   */
  async load(): Promise<DataSourceLoadResult> {
    const resolvedPath = this.resolveFilePath();

    try {
      const stats = await fs.promises.stat(resolvedPath);
      if (!stats || stats.size === 0) {
        throw new Error(
          `Library file is empty or does not exist: ${resolvedPath}`,
        );
      }

      const buffer = await FileSystemAdapter.readLocalFile(resolvedPath);
      const dataView = new DataView(buffer);
      const decoder = new TextDecoder('utf8');
      const value = decoder.decode(dataView);

      const raw = await this.loadWorker.post({
        databaseRaw: value,
        databaseType: this.format,
      });

      // TODO(v0.5.0): Remove backward compatibility shim once all workers return WorkerResponse
      const result: WorkerResponse = Array.isArray(raw)
        ? { entries: raw as EntryData[], parseErrors: [] }
        : raw;

      return {
        sourceId: this.id,
        entries: this.convertToEntries(result.entries),
        modifiedAt: stats.mtime,
        parseErrors: result.parseErrors,
      };
    } catch (error) {
      console.error(`Failed to load from ${this.filePath}:`, error);
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
    } else {
      throw new UnsupportedFormatError(this.format);
    }
  }

  /**
   * Watch for file changes using chokidar
   */
  watch(callback: () => void): void {
    if (this.watcher) {
      console.warn(`LocalFileSource: Watcher already exists for ${this.id}`);
      return;
    }

    this.watchCallback = callback;
    const resolvedPath = this.resolveFilePath();

    // Watcher options
    const watchOptions = {
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      ignoreInitial: true,
    };

    try {
      this.watcher = chokidar.watch(resolvedPath, watchOptions);

      this.watcher.on('change', () => {
        this.triggerCallbackWithDebounce();
      });

      this.watcher.on('add', () => {
        this.triggerCallbackWithDebounce();
      });

      console.debug(`LocalFileSource: Watching ${resolvedPath}`);
    } catch (error) {
      console.error(
        `LocalFileSource: Error setting up watcher for ${resolvedPath}:`,
        error,
      );
      throw error;
    }
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
          `LocalFileSource: File changed, triggering reload for ${this.id}`,
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

    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
      console.debug(`LocalFileSource: Disposed watcher for ${this.id}`);
    }

    this.watchCallback = null;
  }
}
