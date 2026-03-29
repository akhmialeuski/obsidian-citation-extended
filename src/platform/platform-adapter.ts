/**
 * Platform abstraction layer — isolates all host-environment (Obsidian) API
 * usage behind interfaces so that services can be tested and potentially
 * ported without depending on Obsidian directly.
 */

// ---------------------------------------------------------------------------
// File system access (reading/writing raw files, creating folders)
// ---------------------------------------------------------------------------

export interface IFileSystem {
  /** Read a file and return its content as a UTF-8 string. */
  readFile(path: string): Promise<string>;

  /** Write UTF-8 content to a file, creating it if it does not exist. */
  writeFile(path: string, content: string): Promise<void>;

  /** Return true when the path exists on the underlying storage. */
  exists(path: string): Promise<boolean>;

  /** Create a folder (and any missing ancestors) at the given path. */
  createFolder(path: string): Promise<void>;

  /** Absolute path to the root of the current vault / workspace. */
  getBasePath(): string;
}

// ---------------------------------------------------------------------------
// Vault-level file access (Obsidian vault abstraction)
// ---------------------------------------------------------------------------

/** Minimal representation of a vault file. */
export interface IVaultFile {
  readonly path: string;
  readonly name: string;
}

export interface IVaultAccess {
  /** Look up a file or folder by its exact vault-relative path. */
  getAbstractFileByPath(path: string): IVaultFile | null;

  /** Return every markdown file in the vault. */
  getMarkdownFiles(): IVaultFile[];

  /** Create a new file and return a reference to it. */
  create(path: string, content: string): Promise<IVaultFile>;

  /** Read the textual content of an existing vault file. */
  read(file: IVaultFile): Promise<string>;

  /** Create a folder at the given path. Throws if already exists (implementation-dependent). */
  createFolder(path: string): Promise<void>;

  /** Returns true when the vault file represents a regular file (not a folder). */
  isFile(file: IVaultFile): boolean;

  /** Returns true when the vault path points to an existing folder. */
  isFolder(path: string): boolean;

  /** Overwrite the content of an existing vault file. */
  modify(file: IVaultFile, content: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Editor proxy (cursor, text manipulation)
// ---------------------------------------------------------------------------

export interface IEditorPosition {
  line: number;
  ch: number;
}

export interface IEditorProxy {
  getSelection(): string;
  getCursor(): IEditorPosition;
  setCursor(pos: IEditorPosition): void;
  replaceSelection(text: string): void;
  replaceRange(text: string, pos: IEditorPosition): void;
  /** Return the content of the line at the given zero-based line number. */
  getLine(lineNumber: number): string;
}

// ---------------------------------------------------------------------------
// Workspace access (active editor, open file, configuration)
// ---------------------------------------------------------------------------

export interface IWorkspaceAccess {
  /** Return the currently active editor, or null when no editor is focused. */
  getActiveEditor(): IEditorProxy | null;

  /** Open a vault file in a pane. */
  openFile(file: IVaultFile, newPane: boolean): Promise<void>;

  /** Read a workspace configuration value (e.g. `useMarkdownLinks`). */
  getConfig(key: string): unknown;

  /** Open an external URL (file://, http://, zotero://, etc.). */
  openUrl(url: string): void;

  /** Convert a vault file to a display-ready link text. */
  fileToLinktext(
    file: IVaultFile,
    sourcePath: string,
    omitExtension: boolean,
  ): string;
}

// ---------------------------------------------------------------------------
// User notifications
// ---------------------------------------------------------------------------

export interface INotificationService {
  /** Show a transient toast notification to the user. */
  show(message: string): void;
}

// ---------------------------------------------------------------------------
// Status bar (optional, desktop-only in Obsidian)
// ---------------------------------------------------------------------------

export interface IStatusBarItem {
  setText(text: string): void;
  addClass(cls: string): void;
  removeClass(cls: string): void;
}

// ---------------------------------------------------------------------------
// Composite platform adapter
// ---------------------------------------------------------------------------

export interface IPlatformAdapter {
  readonly fileSystem: IFileSystem;
  readonly vault: IVaultAccess;
  readonly workspace: IWorkspaceAccess;
  readonly notifications: INotificationService;

  /** Normalize a path for the current platform. */
  normalizePath(path: string): string;

  /** Resolve a relative path against the vault root (platform-aware). */
  resolvePath(rawPath: string): string;

  /** Add a status bar element (returns a no-op stub on mobile). */
  addStatusBarItem(): IStatusBarItem;
}
