import {
  App,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
  normalizePath,
} from 'obsidian';

import type {
  IEditorProxy,
  IFileSystem,
  INotificationService,
  IPlatformAdapter,
  IStatusBarItem,
  IVaultAccess,
  IVaultFile,
  IWorkspaceAccess,
} from './platform-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WorkspaceExt {
  activeEditor?: { editor?: IEditorProxy } | null;
}

interface VaultExt {
  getConfig(key: string): unknown;
}

// ---------------------------------------------------------------------------
// Sub-adapter implementations
// ---------------------------------------------------------------------------

class ObsidianFileSystem implements IFileSystem {
  constructor(private app: App) {}

  async readFile(path: string): Promise<string> {
    const buffer = await FileSystemAdapter.readLocalFile(path);
    return new TextDecoder('utf-8').decode(buffer);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.app.vault.adapter.write(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path);
  }

  async createFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) return;
    if (existing) return;

    try {
      await this.app.vault.createFolder(normalized);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (!msg.includes('Folder already exists')) {
        throw e;
      }
    }
  }

  getBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return '';
  }
}

class ObsidianVaultAccess implements IVaultAccess {
  constructor(private app: App) {}

  getAbstractFileByPath(path: string): IVaultFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return { path: file.path, name: file.name };
    }
    return null;
  }

  getMarkdownFiles(): IVaultFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => ({ path: f.path, name: f.name }));
  }

  async create(path: string, content: string): Promise<IVaultFile> {
    const file = await this.app.vault.create(path, content);
    return { path: file.path, name: file.name };
  }

  async read(file: IVaultFile): Promise<string> {
    const tFile = this.app.vault.getAbstractFileByPath(file.path);
    if (tFile instanceof TFile) {
      return this.app.vault.read(tFile);
    }
    throw new Error(`Cannot read file at ${file.path}`);
  }
}

class ObsidianWorkspaceAccess implements IWorkspaceAccess {
  constructor(private app: App) {}

  getActiveEditor(): IEditorProxy | null {
    // Standard MarkdownView approach
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) return view.editor as unknown as IEditorProxy;

    // Fallback: activeEditor supports Canvas text nodes, Lineage, etc.
    const ext = this.app.workspace as unknown as WorkspaceExt;
    return (ext.activeEditor?.editor as IEditorProxy) ?? null;
  }

  async openFile(file: IVaultFile, newPane: boolean): Promise<void> {
    const tFile = this.app.vault.getAbstractFileByPath(file.path);
    if (tFile instanceof TFile) {
      await this.app.workspace.getLeaf(newPane).openFile(tFile);
    }
  }

  getConfig(key: string): unknown {
    return (this.app.vault as unknown as VaultExt).getConfig(key);
  }

  fileToLinktext(
    file: IVaultFile,
    sourcePath: string,
    omitExtension: boolean,
  ): string {
    const tFile = this.app.vault.getAbstractFileByPath(file.path);
    if (tFile instanceof TFile) {
      return this.app.metadataCache.fileToLinktext(
        tFile,
        sourcePath,
        omitExtension,
      );
    }
    return file.path;
  }
}

class ObsidianNotificationService implements INotificationService {
  show(message: string): void {
    new Notice(message);
  }
}

// ---------------------------------------------------------------------------
// Composite adapter
// ---------------------------------------------------------------------------

export class ObsidianPlatformAdapter implements IPlatformAdapter {
  readonly fileSystem: IFileSystem;
  readonly vault: IVaultAccess;
  readonly workspace: IWorkspaceAccess;
  readonly notifications: INotificationService;

  constructor(
    private app: App,
    private plugin: Plugin,
  ) {
    this.fileSystem = new ObsidianFileSystem(app);
    this.vault = new ObsidianVaultAccess(app);
    this.workspace = new ObsidianWorkspaceAccess(app);
    this.notifications = new ObsidianNotificationService();
  }

  normalizePath(path: string): string {
    return normalizePath(path);
  }

  addStatusBarItem(): IStatusBarItem {
    const el = this.plugin.addStatusBarItem();
    return {
      setText: (text: string) => el.setText(text),
      addClass: (cls: string) => el.addClass(cls),
      removeClass: (cls: string) => el.removeClass(cls),
    };
  }
}
