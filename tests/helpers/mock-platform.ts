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
 * Each sub-interface is independently mockable via overrides.
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
    createFolder: jest.fn().mockResolvedValue(undefined),
    isFile: jest.fn().mockReturnValue(true),
    isFolder: jest.fn().mockReturnValue(false),
    modify: jest.fn().mockResolvedValue(undefined),
    ...(overrides.vault as Partial<IVaultAccess>),
  };

  const workspace: IWorkspaceAccess = {
    getActiveEditor: jest.fn().mockReturnValue(null),
    openFile: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockReturnValue(null),
    fileToLinktext: jest.fn().mockReturnValue('link'),
    openUrl: jest.fn(),
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
    resolvePath: jest.fn((p: string) => `/vault/${p}`),
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

export type {
  IPlatformAdapter,
  IFileSystem,
  IVaultAccess,
  IVaultFile,
  IWorkspaceAccess,
  IEditorProxy,
  INotificationService,
  IStatusBarItem,
};
