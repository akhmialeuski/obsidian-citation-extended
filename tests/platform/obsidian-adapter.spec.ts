/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockNoticeFn = jest.fn();

let mockAdapterWrite: jest.Mock;
let mockAdapterExists: jest.Mock;
let mockGetAbstractFileByPath: jest.Mock;
let mockGetMarkdownFiles: jest.Mock;
let mockVaultCreate: jest.Mock;
let mockVaultRead: jest.Mock;
let mockVaultCreateFolder: jest.Mock;
let mockGetActiveViewOfType: jest.Mock;
let mockGetLeaf: jest.Mock;
let mockFileToLinktext: jest.Mock;
let mockVaultGetConfig: jest.Mock;
let mockReadLocalFile: jest.Mock;
let mockPluginAddStatusBarItem: jest.Mock;

// TFile / TFolder constructors that preserve instanceof checks
class MockTFile {
  path = '';
  name = '';
}

class MockTFolder {
  path = '';
  name = '';
}

class MockFileSystemAdapter {
  getBasePath() {
    return '/vault';
  }
  static readLocalFile = (...args: any[]) => mockReadLocalFile(...args);
}

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    FileSystemAdapter: MockFileSystemAdapter,
    MarkdownView: class {},
    Modal: class {},
    Notice: class {
      constructor(...args: any[]) {
        mockNoticeFn(...args);
      }
    },
    Plugin: class {
      addStatusBarItem() {
        return mockPluginAddStatusBarItem();
      }
    },
    PluginSettingTab: class {},
    Setting: class {},
    SuggestModal: class {},
    TFile: MockTFile,
    TFolder: MockTFolder,
    normalizePath: (p: string) => p,
  }),
  { virtual: true },
);

import { ObsidianPlatformAdapter } from '../../src/platform/obsidian-adapter';
import { App, Plugin, TFile, TFolder, FileSystemAdapter } from 'obsidian';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Create a mock TFile with instanceof support */
function makeTFile(filePath: string, fileName: string): TFile {
  const f = new TFile();
  f.path = filePath;
  f.name = fileName;
  return f;
}

/** Create a mock TFolder with instanceof support */
function makeTFolder(folderPath: string): TFolder {
  const f = new TFolder();
  (f as any).path = folderPath;
  return f;
}

function createMockApp(): App {
  mockAdapterWrite = jest.fn().mockResolvedValue(undefined);
  mockAdapterExists = jest.fn().mockResolvedValue(true);
  mockGetAbstractFileByPath = jest.fn().mockReturnValue(null);
  mockGetMarkdownFiles = jest.fn().mockReturnValue([]);
  mockVaultCreate = jest.fn();
  mockVaultRead = jest.fn();
  mockVaultCreateFolder = jest.fn().mockResolvedValue(undefined);
  mockGetActiveViewOfType = jest.fn().mockReturnValue(null);
  mockGetLeaf = jest.fn().mockReturnValue({
    openFile: jest.fn().mockResolvedValue(undefined),
  });
  mockFileToLinktext = jest.fn().mockReturnValue('link-text');
  mockVaultGetConfig = jest.fn().mockReturnValue(null);
  mockReadLocalFile = jest
    .fn()
    .mockResolvedValue(new TextEncoder().encode('file content').buffer);

  return {
    vault: {
      adapter: {
        write: mockAdapterWrite,
        exists: mockAdapterExists,
        getBasePath: () => '/vault',
      } as unknown as FileSystemAdapter,
      getAbstractFileByPath: mockGetAbstractFileByPath,
      getMarkdownFiles: mockGetMarkdownFiles,
      create: mockVaultCreate,
      read: mockVaultRead,
      createFolder: mockVaultCreateFolder,
      getConfig: mockVaultGetConfig,
    },
    workspace: {
      getActiveViewOfType: mockGetActiveViewOfType,
      getLeaf: mockGetLeaf,
      activeEditor: null,
    },
    metadataCache: {
      fileToLinktext: mockFileToLinktext,
    },
  } as unknown as App;
}

function createMockPlugin(): Plugin {
  mockPluginAddStatusBarItem = jest.fn().mockReturnValue({
    setText: jest.fn(),
    addClass: jest.fn(),
    removeClass: jest.fn(),
  });

  return {
    addStatusBarItem: () => mockPluginAddStatusBarItem(),
  } as unknown as Plugin;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ObsidianPlatformAdapter', () => {
  let app: App;
  let plugin: Plugin;
  let adapter: ObsidianPlatformAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createMockApp();
    plugin = createMockPlugin();
    adapter = new ObsidianPlatformAdapter(app, plugin);
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('exposes all sub-adapters', () => {
      expect(adapter.fileSystem).toBeDefined();
      expect(adapter.vault).toBeDefined();
      expect(adapter.workspace).toBeDefined();
      expect(adapter.notifications).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // ObsidianFileSystem (lines 40-79)
  // -----------------------------------------------------------------------

  describe('ObsidianFileSystem', () => {
    describe('readFile', () => {
      it('reads a local file and returns UTF-8 string', async () => {
        const content = await adapter.fileSystem.readFile('/some/path.bib');

        expect(mockReadLocalFile).toHaveBeenCalledWith('/some/path.bib');
        expect(content).toBe('file content');
      });

      it('handles empty file content', async () => {
        mockReadLocalFile.mockResolvedValue(new ArrayBuffer(0));

        const content = await adapter.fileSystem.readFile('/empty.txt');
        expect(content).toBe('');
      });
    });

    describe('writeFile', () => {
      it('delegates to vault adapter write', async () => {
        await adapter.fileSystem.writeFile('notes/test.md', 'hello');

        expect(mockAdapterWrite).toHaveBeenCalledWith('notes/test.md', 'hello');
      });
    });

    describe('exists', () => {
      it('returns true when path exists', async () => {
        mockAdapterExists.mockResolvedValue(true);

        const result = await adapter.fileSystem.exists('notes/test.md');
        expect(result).toBe(true);
      });

      it('returns false when path does not exist', async () => {
        mockAdapterExists.mockResolvedValue(false);

        const result = await adapter.fileSystem.exists('missing.md');
        expect(result).toBe(false);
      });
    });

    describe('createFolder', () => {
      it('creates folder when it does not exist', async () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        await adapter.fileSystem.createFolder('notes/subfolder');

        expect(mockVaultCreateFolder).toHaveBeenCalledWith('notes/subfolder');
      });

      it('does nothing when folder already exists (TFolder)', async () => {
        const folder = makeTFolder('notes/subfolder');
        mockGetAbstractFileByPath.mockReturnValue(folder);

        await adapter.fileSystem.createFolder('notes/subfolder');

        expect(mockVaultCreateFolder).not.toHaveBeenCalled();
      });

      it('does nothing when path points to an existing non-folder entity', async () => {
        // Return something that is NOT TFolder but is truthy — the code returns early
        const file = { path: 'notes/subfolder', name: 'subfolder' };
        mockGetAbstractFileByPath.mockReturnValue(file);

        await adapter.fileSystem.createFolder('notes/subfolder');

        expect(mockVaultCreateFolder).not.toHaveBeenCalled();
      });

      it('swallows "Folder already exists" error', async () => {
        mockGetAbstractFileByPath.mockReturnValue(null);
        mockVaultCreateFolder.mockRejectedValue(
          new Error('Folder already exists'),
        );

        await expect(
          adapter.fileSystem.createFolder('notes/subfolder'),
        ).resolves.toBeUndefined();
      });

      it('rethrows non-"Folder already exists" errors', async () => {
        mockGetAbstractFileByPath.mockReturnValue(null);
        mockVaultCreateFolder.mockRejectedValue(new Error('Permission denied'));

        await expect(
          adapter.fileSystem.createFolder('notes/subfolder'),
        ).rejects.toThrow('Permission denied');
      });

      it('rethrows when error has no message property', async () => {
        mockGetAbstractFileByPath.mockReturnValue(null);
        // Throw an object without a message property to cover the || '' branch
        mockVaultCreateFolder.mockRejectedValue({ code: 'UNKNOWN' });

        await expect(
          adapter.fileSystem.createFolder('notes/subfolder'),
        ).rejects.toEqual({ code: 'UNKNOWN' });
      });
    });

    describe('getBasePath', () => {
      it('returns empty string when vault adapter is not FileSystemAdapter', () => {
        // Default mock: app.vault.adapter is a plain object, not an instance
        const basePath = adapter.fileSystem.getBasePath();
        expect(basePath).toBe('');
      });

      it('returns vault base path when adapter is FileSystemAdapter', () => {
        const fsAdapter = new MockFileSystemAdapter();
        const appWithFS = {
          ...app,
          vault: {
            ...(app.vault as any),
            adapter: fsAdapter,
          },
        } as unknown as App;

        const adapterWithFS = new ObsidianPlatformAdapter(appWithFS, plugin);
        const basePath = adapterWithFS.fileSystem.getBasePath();
        expect(basePath).toBe('/vault');
      });
    });
  });

  // -----------------------------------------------------------------------
  // ObsidianVaultAccess (lines 81-110)
  // -----------------------------------------------------------------------

  describe('ObsidianVaultAccess', () => {
    describe('getAbstractFileByPath', () => {
      it('returns IVaultFile when path points to a TFile', () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);

        const result = adapter.vault.getAbstractFileByPath('notes/test.md');

        expect(result).toEqual({ path: 'notes/test.md', name: 'test.md' });
      });

      it('returns null when path does not exist', () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        const result = adapter.vault.getAbstractFileByPath('missing.md');
        expect(result).toBeNull();
      });

      it('returns file descriptor even when path points to a folder', () => {
        const folder = makeTFolder('notes');
        mockGetAbstractFileByPath.mockReturnValue(folder);

        const result = adapter.vault.getAbstractFileByPath('notes');
        // getAbstractFileByPath now returns any abstract file; use isFile/isFolder to distinguish
        expect(result).toEqual({ path: 'notes', name: '' });
      });
    });

    describe('getMarkdownFiles', () => {
      it('returns mapped vault file objects', () => {
        const files = [
          makeTFile('notes/a.md', 'a.md'),
          makeTFile('notes/b.md', 'b.md'),
        ];
        mockGetMarkdownFiles.mockReturnValue(files);

        const result = adapter.vault.getMarkdownFiles();

        expect(result).toEqual([
          { path: 'notes/a.md', name: 'a.md' },
          { path: 'notes/b.md', name: 'b.md' },
        ]);
      });

      it('returns empty array when no markdown files exist', () => {
        mockGetMarkdownFiles.mockReturnValue([]);

        const result = adapter.vault.getMarkdownFiles();
        expect(result).toEqual([]);
      });
    });

    describe('create', () => {
      it('creates a new file and returns IVaultFile', async () => {
        const createdFile = makeTFile('notes/new.md', 'new.md');
        mockVaultCreate.mockResolvedValue(createdFile);

        const result = await adapter.vault.create('notes/new.md', '# New Note');

        expect(mockVaultCreate).toHaveBeenCalledWith(
          'notes/new.md',
          '# New Note',
        );
        expect(result).toEqual({ path: 'notes/new.md', name: 'new.md' });
      });
    });

    describe('createFolder', () => {
      it('delegates to vault.createFolder', async () => {
        await adapter.vault.createFolder('notes/subfolder');

        expect(mockVaultCreateFolder).toHaveBeenCalledWith('notes/subfolder');
      });
    });

    describe('isFile', () => {
      it('returns true when path points to a TFile', () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);

        const result = adapter.vault.isFile({
          path: 'notes/test.md',
          name: 'test.md',
        });
        expect(result).toBe(true);
      });

      it('returns false when path points to a folder', () => {
        const folder = makeTFolder('notes');
        mockGetAbstractFileByPath.mockReturnValue(folder);

        const result = adapter.vault.isFile({ path: 'notes', name: '' });
        expect(result).toBe(false);
      });

      it('returns false when path does not exist', () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        const result = adapter.vault.isFile({
          path: 'missing.md',
          name: 'missing.md',
        });
        expect(result).toBe(false);
      });
    });

    describe('isFolder', () => {
      it('returns true when path points to a TFolder', () => {
        const folder = makeTFolder('notes');
        mockGetAbstractFileByPath.mockReturnValue(folder);

        const result = adapter.vault.isFolder('notes');
        expect(result).toBe(true);
      });

      it('returns false when path points to a TFile', () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);

        const result = adapter.vault.isFolder('notes/test.md');
        expect(result).toBe(false);
      });

      it('returns false when path does not exist', () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        const result = adapter.vault.isFolder('missing');
        expect(result).toBe(false);
      });
    });

    describe('read', () => {
      it('reads the content of an existing TFile', async () => {
        const tFile = makeTFile('notes/existing.md', 'existing.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);
        mockVaultRead.mockResolvedValue('# Existing Note Content');

        const content = await adapter.vault.read({
          path: 'notes/existing.md',
          name: 'existing.md',
        });

        expect(content).toBe('# Existing Note Content');
        expect(mockVaultRead).toHaveBeenCalledWith(tFile);
      });

      it('throws when file is not found', async () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        await expect(
          adapter.vault.read({ path: 'missing.md', name: 'missing.md' }),
        ).rejects.toThrow('Cannot read file at missing.md');
      });

      it('throws when path points to a folder', async () => {
        const folder = makeTFolder('notes');
        mockGetAbstractFileByPath.mockReturnValue(folder);

        await expect(
          adapter.vault.read({ path: 'notes', name: 'notes' }),
        ).rejects.toThrow('Cannot read file at notes');
      });
    });
  });

  // -----------------------------------------------------------------------
  // ObsidianWorkspaceAccess (lines 112-151)
  // -----------------------------------------------------------------------

  describe('ObsidianWorkspaceAccess', () => {
    describe('getActiveEditor', () => {
      it('returns editor from MarkdownView when available', () => {
        const mockEditor = {
          getSelection: jest.fn(),
          getCursor: jest.fn(),
          setCursor: jest.fn(),
          replaceSelection: jest.fn(),
          replaceRange: jest.fn(),
        };
        mockGetActiveViewOfType.mockReturnValue({ editor: mockEditor });

        const editor = adapter.workspace.getActiveEditor();
        expect(editor).toBe(mockEditor);
      });

      it('returns null when no active view', () => {
        mockGetActiveViewOfType.mockReturnValue(null);

        const editor = adapter.workspace.getActiveEditor();
        expect(editor).toBeNull();
      });

      it('falls back to workspace.activeEditor when MarkdownView has no editor', () => {
        mockGetActiveViewOfType.mockReturnValue(null);
        const fallbackEditor = {
          getSelection: jest.fn(),
          getCursor: jest.fn(),
          setCursor: jest.fn(),
          replaceSelection: jest.fn(),
          replaceRange: jest.fn(),
        };
        (app.workspace as any).activeEditor = { editor: fallbackEditor };

        const editor = adapter.workspace.getActiveEditor();
        expect(editor).toBe(fallbackEditor);
      });

      it('returns null when activeEditor fallback has no editor', () => {
        mockGetActiveViewOfType.mockReturnValue(null);
        (app.workspace as any).activeEditor = {};

        const editor = adapter.workspace.getActiveEditor();
        expect(editor).toBeNull();
      });

      it('returns null when activeEditor fallback is null', () => {
        mockGetActiveViewOfType.mockReturnValue(null);
        (app.workspace as any).activeEditor = null;

        const editor = adapter.workspace.getActiveEditor();
        expect(editor).toBeNull();
      });
    });

    describe('openFile', () => {
      it('opens a file in a new pane', async () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);
        const mockOpenFile = jest.fn().mockResolvedValue(undefined);
        mockGetLeaf.mockReturnValue({ openFile: mockOpenFile });

        await adapter.workspace.openFile(
          { path: 'notes/test.md', name: 'test.md' },
          true,
        );

        expect(mockGetLeaf).toHaveBeenCalledWith(true);
        expect(mockOpenFile).toHaveBeenCalledWith(tFile);
      });

      it('opens a file in the same pane', async () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);
        const mockOpenFile = jest.fn().mockResolvedValue(undefined);
        mockGetLeaf.mockReturnValue({ openFile: mockOpenFile });

        await adapter.workspace.openFile(
          { path: 'notes/test.md', name: 'test.md' },
          false,
        );

        expect(mockGetLeaf).toHaveBeenCalledWith(false);
      });

      it('does nothing when file is not found as TFile', async () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        await adapter.workspace.openFile(
          { path: 'missing.md', name: 'missing.md' },
          false,
        );

        expect(mockGetLeaf).not.toHaveBeenCalled();
      });
    });

    describe('getConfig', () => {
      it('reads vault configuration value', () => {
        mockVaultGetConfig.mockReturnValue(true);

        const value = adapter.workspace.getConfig('useMarkdownLinks');
        expect(value).toBe(true);
      });

      it('returns null for unknown config key', () => {
        mockVaultGetConfig.mockReturnValue(null);

        const value = adapter.workspace.getConfig('unknownKey');
        expect(value).toBeNull();
      });
    });

    describe('fileToLinktext', () => {
      it('converts a TFile to link text via metadataCache', () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);
        mockFileToLinktext.mockReturnValue('test');

        const result = adapter.workspace.fileToLinktext(
          { path: 'notes/test.md', name: 'test.md' },
          '',
          true,
        );

        expect(result).toBe('test');
        expect(mockFileToLinktext).toHaveBeenCalledWith(tFile, '', true);
      });

      it('returns file path when getAbstractFileByPath does not return a TFile', () => {
        mockGetAbstractFileByPath.mockReturnValue(null);

        const result = adapter.workspace.fileToLinktext(
          { path: 'notes/test.md', name: 'test.md' },
          '',
          true,
        );

        expect(result).toBe('notes/test.md');
        expect(mockFileToLinktext).not.toHaveBeenCalled();
      });

      it('passes omitExtension=false correctly', () => {
        const tFile = makeTFile('notes/test.md', 'test.md');
        mockGetAbstractFileByPath.mockReturnValue(tFile);
        mockFileToLinktext.mockReturnValue('test.md');

        const result = adapter.workspace.fileToLinktext(
          { path: 'notes/test.md', name: 'test.md' },
          'source.md',
          false,
        );

        expect(result).toBe('test.md');
        expect(mockFileToLinktext).toHaveBeenCalledWith(
          tFile,
          'source.md',
          false,
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // ObsidianNotificationService (lines 153-157)
  // -----------------------------------------------------------------------

  describe('ObsidianNotificationService', () => {
    it('creates a Notice with the given message', () => {
      adapter.notifications.show('Hello world');

      expect(mockNoticeFn).toHaveBeenCalledWith('Hello world');
    });

    it('can be called multiple times', () => {
      adapter.notifications.show('First');
      adapter.notifications.show('Second');

      expect(mockNoticeFn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // ObsidianPlatformAdapter (lines 168-206)
  // -----------------------------------------------------------------------

  describe('normalizePath', () => {
    it('delegates to obsidian normalizePath', () => {
      const result = adapter.normalizePath('some/path with spaces');
      expect(result).toBe('some/path with spaces');
    });

    it('passes through slashes unchanged (mock implementation)', () => {
      const result = adapter.normalizePath('a/b/c');
      expect(result).toBe('a/b/c');
    });
  });

  describe('resolvePath', () => {
    it('returns rawPath when basePath is empty (mobile environment)', () => {
      // Default mock: app.vault.adapter is a plain object, not instanceof FileSystemAdapter
      // So getBasePath returns '' and resolvePath returns rawPath as-is
      const result = adapter.resolvePath('my/path.bib');

      expect(result).toBe('my/path.bib');
    });

    it('resolves absolute path using node path.resolve when basePath exists', () => {
      const fsAdapter = new MockFileSystemAdapter();
      const appWithFS = {
        ...app,
        vault: {
          ...(app.vault as any),
          adapter: fsAdapter,
        },
      } as unknown as App;

      const adapterWithFS = new ObsidianPlatformAdapter(appWithFS, plugin);

      const result = adapterWithFS.resolvePath('refs/library.bib');

      // path.resolve('/vault', 'refs/library.bib') = '/vault/refs/library.bib'
      expect(result).toBe('/vault/refs/library.bib');
    });
  });

  describe('addStatusBarItem', () => {
    it('returns a status bar item with setText, addClass, removeClass', () => {
      const item = adapter.addStatusBarItem();

      expect(item).toBeDefined();
      expect(typeof item.setText).toBe('function');
      expect(typeof item.addClass).toBe('function');
      expect(typeof item.removeClass).toBe('function');
    });

    it('delegates setText to the underlying element', () => {
      const mockEl = {
        setText: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn(),
      };
      mockPluginAddStatusBarItem.mockReturnValue(mockEl);

      const item = adapter.addStatusBarItem();
      item.setText('Loading...');

      expect(mockEl.setText).toHaveBeenCalledWith('Loading...');
    });

    it('delegates addClass to the underlying element', () => {
      const mockEl = {
        setText: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn(),
      };
      mockPluginAddStatusBarItem.mockReturnValue(mockEl);

      const item = adapter.addStatusBarItem();
      item.addClass('mod-error');

      expect(mockEl.addClass).toHaveBeenCalledWith('mod-error');
    });

    it('delegates removeClass to the underlying element', () => {
      const mockEl = {
        setText: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn(),
      };
      mockPluginAddStatusBarItem.mockReturnValue(mockEl);

      const item = adapter.addStatusBarItem();
      item.removeClass('mod-error');

      expect(mockEl.removeClass).toHaveBeenCalledWith('mod-error');
    });
  });
});
