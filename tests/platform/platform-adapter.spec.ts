import type {
  IPlatformAdapter,
  IFileSystem,
  IVaultAccess,
  IVaultFile,
  IWorkspaceAccess,
  IEditorProxy,
  INotificationService,
  IStatusBarItem,
} from '../../src/platform/platform-adapter';

/**
 * Creates a fully-mocked IPlatformAdapter for use in tests.
 * Each sub-interface is independently mockable.
 */
export function createMockPlatformAdapter(
  overrides: Partial<IPlatformAdapter> = {},
): IPlatformAdapter {
  const fileSystem: IFileSystem = {
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    createFolder: jest.fn().mockResolvedValue(undefined),
    getBasePath: jest.fn().mockReturnValue('/vault'),
    ...(overrides.fileSystem as Partial<IFileSystem>),
  };

  const vault: IVaultAccess = {
    getAbstractFileByPath: jest.fn().mockReturnValue(null),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    create: jest.fn().mockResolvedValue({ path: 'new.md', name: 'new.md' }),
    read: jest.fn().mockResolvedValue(''),
    ...(overrides.vault as Partial<IVaultAccess>),
  };

  const workspace: IWorkspaceAccess = {
    getActiveEditor: jest.fn().mockReturnValue(null),
    openFile: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockReturnValue(null),
    fileToLinktext: jest.fn().mockReturnValue('link'),
    ...(overrides.workspace as Partial<IWorkspaceAccess>),
  };

  const notifications: INotificationService = {
    show: jest.fn(),
    ...(overrides.notifications as Partial<INotificationService>),
  };

  return {
    fileSystem,
    vault,
    workspace,
    notifications,
    normalizePath: jest.fn((p: string) => p),
    addStatusBarItem: jest.fn(
      (): IStatusBarItem => ({
        setText: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn(),
      }),
    ),
    ...overrides,
  };
}

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

    const content = await adapter.fileSystem.readFile('/test');
    expect(content).toBe('');
    expect(adapter.fileSystem.readFile).toHaveBeenCalledWith('/test');

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
    };

    const adapter = createMockPlatformAdapter({
      workspace: {
        getActiveEditor: jest.fn().mockReturnValue(mockEditor),
        openFile: jest.fn().mockResolvedValue(undefined),
        getConfig: jest.fn(),
        fileToLinktext: jest.fn().mockReturnValue('link'),
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
    item.setText('loading...');
    item.addClass('mod-error');
    item.removeClass('mod-error');

    expect(item.setText).toHaveBeenCalledWith('loading...');
    expect(item.addClass).toHaveBeenCalledWith('mod-error');
    expect(item.removeClass).toHaveBeenCalledWith('mod-error');
  });

  it('normalizePath passes through by default', () => {
    const adapter = createMockPlatformAdapter();
    expect(adapter.normalizePath('some/path')).toBe('some/path');
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
      },
    });

    expect(adapter.vault.getMarkdownFiles()).toHaveLength(2);
    expect(adapter.vault.getMarkdownFiles()[0].name).toBe('a.md');
  });
});
