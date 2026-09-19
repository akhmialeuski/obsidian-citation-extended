import {
  createMockPlatformAdapter,
  IEditorProxy,
  IVaultFile,
} from '../helpers/mock-platform';

describe('IPlatformAdapter mock factory', () => {
  it('creates a valid mock with all sub-interfaces', () => {
    const adapter = createMockPlatformAdapter();

    expect(adapter.fileSystem).toBeDefined();
    expect(adapter.vault).toBeDefined();
    expect(adapter.workspace).toBeDefined();
    expect(adapter.notifications).toBeDefined();
    expect(typeof adapter.normalizePath).toBe('function');
    expect(typeof adapter.addStatusBarItem).toBe('function');
  });

  it('fileSystem methods are callable', async () => {
    const adapter = createMockPlatformAdapter();

    // Vault-relative, per the IFileSystem contract — an absolute OS path
    // here would document the very mix-up that made every cache write-only
    // (issue #87).
    const cachePath = '.obsidian/plugins/citation-extended/cache.json';
    const content = await adapter.fileSystem.readFile(cachePath);
    expect(content).toBe('');
    expect(adapter.fileSystem.readFile).toHaveBeenCalledWith(cachePath);

    expect(adapter.fileSystem.getBasePath()).toBe('/vault');
  });

  it('vault methods return expected defaults', () => {
    const adapter = createMockPlatformAdapter();

    expect(adapter.vault.getAbstractFileByPath('any')).toBeNull();
    expect(adapter.vault.getMarkdownFiles()).toEqual([]);
  });

  it('workspace getActiveEditor returns null by default', () => {
    const adapter = createMockPlatformAdapter();
    expect(adapter.workspace.getActiveEditor()).toBeNull();
  });

  it('allows overriding sub-interfaces', () => {
    const mockEditor: IEditorProxy = {
      getSelection: jest.fn().mockReturnValue('selected'),
      getCursor: jest.fn().mockReturnValue({ line: 0, ch: 0 }),
      setCursor: jest.fn(),
      replaceSelection: jest.fn(),
      replaceRange: jest.fn(),
      getLine: jest.fn().mockReturnValue(''),
    };

    const adapter = createMockPlatformAdapter({
      workspace: {
        getActiveEditor: jest.fn().mockReturnValue(mockEditor),
        getActiveFile: jest.fn().mockReturnValue(null),
        openFile: jest.fn().mockResolvedValue(undefined),
        getConfig: jest.fn(),
        fileToLinktext: jest.fn().mockReturnValue('link'),
        openUrl: jest.fn(),
      },
    });

    const editor = adapter.workspace.getActiveEditor();
    expect(editor).toBe(mockEditor);
    expect(editor?.getSelection()).toBe('selected');
  });

  it('notifications.show is trackable', () => {
    const adapter = createMockPlatformAdapter();

    adapter.notifications.show('test message');

    expect(adapter.notifications.show).toHaveBeenCalledWith('test message');
  });

  it('addStatusBarItem returns a mock item', () => {
    const adapter = createMockPlatformAdapter();

    const item = adapter.addStatusBarItem();
    item.setText('Loading...');
    item.addClass('mod-error');
    item.removeClass('mod-error');

    expect(item.setText).toHaveBeenCalledWith('Loading...');
    expect(item.addClass).toHaveBeenCalledWith('mod-error');
    expect(item.removeClass).toHaveBeenCalledWith('mod-error');
  });

  it('normalizePath applies Obsidian semantics, not a pass-through', () => {
    const adapter = createMockPlatformAdapter();
    // An already-normal path is unchanged, which is what makes a
    // pass-through double look correct until a path needs real work.
    expect(adapter.normalizePath('some/path')).toBe('some/path');
    expect(adapter.normalizePath('/a//b/')).toBe('a/b');
    // The case issue #86 turned on: the root is '/', never ''.
    expect(adapter.normalizePath('')).toBe('/');
  });

  it('vault.create returns a file reference', async () => {
    const adapter = createMockPlatformAdapter();
    const file = await adapter.vault.create('notes/test.md', 'content');
    expect(file.path).toBe('new.md');
  });

  it('allows custom vault file list', () => {
    const files: IVaultFile[] = [
      { path: 'notes/a.md', name: 'a.md' },
      { path: 'notes/b.md', name: 'b.md' },
    ];
    const adapter = createMockPlatformAdapter({
      vault: {
        getAbstractFileByPath: jest.fn(),
        getMarkdownFiles: jest.fn().mockReturnValue(files),
        create: jest.fn().mockResolvedValue(files[0]),
        read: jest.fn().mockResolvedValue(''),
        createFolder: jest.fn().mockResolvedValue(undefined),
        isFile: jest.fn().mockReturnValue(true),
        isFolder: jest.fn().mockReturnValue(false),
        modify: jest.fn().mockResolvedValue(undefined),
        getFrontmatter: jest.fn().mockReturnValue(null),
      },
    });

    expect(adapter.vault.getMarkdownFiles()).toHaveLength(2);
    expect(adapter.vault.getMarkdownFiles()[0].name).toBe('a.md');
  });
});
