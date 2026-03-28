import {
  ContentTemplateResolver,
  IContentTemplateResolver,
} from '../../src/application/content-template-resolver';
import { DEFAULT_CONTENT_TEMPLATE } from '../../src/ui/settings/settings-schema';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeMocks(overrides: Record<string, unknown> = {}) {
  const vault = {
    getAbstractFileByPath: jest.fn(() => null),
    isFile: jest.fn(() => true),
    read: jest.fn(() => Promise.resolve('vault template content')),
    create: jest.fn(() =>
      Promise.resolve({ path: 'citation-content-template.md', name: 'citation-content-template.md' }),
    ),
    ...(overrides.vault as Record<string, unknown>),
  };

  const notifications = {
    show: jest.fn(),
    ...(overrides.notifications as Record<string, unknown>),
  };

  const settings = {
    literatureNoteContentTemplatePath: '',
    literatureNoteContentTemplate: '',
    ...(overrides.settings as Record<string, unknown>),
  };

  const normalizePath = jest.fn((p: string) => p);
  const saveSettings = jest.fn(() => Promise.resolve());

  return { vault, notifications, settings, normalizePath, saveSettings };
}

function createResolver(
  overrides: Record<string, unknown> = {},
): { resolver: IContentTemplateResolver; mocks: ReturnType<typeof makeMocks> } {
  const mocks = makeMocks(overrides);
  const resolver = new ContentTemplateResolver(
    mocks.vault as never,
    mocks.notifications as never,
    mocks.settings as never,
    mocks.normalizePath,
    mocks.saveSettings,
  );
  return { resolver, mocks };
}

describe('ContentTemplateResolver', () => {
  describe('resolve', () => {
    it('reads template from vault when path is configured', async () => {
      const file = { path: 'template.md', name: 'template.md' };
      const { resolver, mocks } = createResolver({
        settings: { literatureNoteContentTemplatePath: 'template.md' },
        vault: {
          getAbstractFileByPath: jest.fn(() => file),
          isFile: jest.fn(() => true),
          read: jest.fn(() => Promise.resolve('custom template')),
        },
      });

      const result = await resolver.resolve();

      expect(result).toBe('custom template');
      expect(mocks.vault.read).toHaveBeenCalledWith(file);
    });

    it('returns default template when file not found', async () => {
      const { resolver, mocks } = createResolver({
        settings: { literatureNoteContentTemplatePath: 'missing.md' },
        vault: { getAbstractFileByPath: jest.fn(() => null) },
      });

      const result = await resolver.resolve();

      expect(result).toBe(DEFAULT_CONTENT_TEMPLATE);
      expect(mocks.notifications.show).toHaveBeenCalledWith(
        expect.stringContaining('template file not found'),
      );
    });

    it('returns default template when no path configured', async () => {
      const { resolver } = createResolver();

      const result = await resolver.resolve();

      expect(result).toBe(DEFAULT_CONTENT_TEMPLATE);
    });

    it('returns default when file exists but is not a file (is folder)', async () => {
      const { resolver } = createResolver({
        settings: { literatureNoteContentTemplatePath: 'folder' },
        vault: {
          getAbstractFileByPath: jest.fn(() => ({ path: 'folder', name: 'folder' })),
          isFile: jest.fn(() => false),
        },
      });

      const result = await resolver.resolve();

      expect(result).toBe(DEFAULT_CONTENT_TEMPLATE);
    });
  });

  describe('migrateInlineToFile', () => {
    it('creates file from inline template content', async () => {
      const { resolver, mocks } = createResolver({
        settings: {
          literatureNoteContentTemplate: 'inline content',
          literatureNoteContentTemplatePath: '',
        },
      });

      await resolver.migrateInlineToFile();

      expect(mocks.vault.create).toHaveBeenCalledWith(
        'citation-content-template.md',
        'inline content',
      );
      expect(mocks.settings.literatureNoteContentTemplatePath).toBe(
        'citation-content-template.md',
      );
      expect(mocks.settings.literatureNoteContentTemplate).toBe('');
      expect(mocks.saveSettings).toHaveBeenCalled();
    });

    it('does nothing when no inline content', async () => {
      const { resolver, mocks } = createResolver({
        settings: { literatureNoteContentTemplate: '' },
      });

      await resolver.migrateInlineToFile();

      expect(mocks.vault.create).not.toHaveBeenCalled();
    });

    it('does not create file if it already exists', async () => {
      const { resolver, mocks } = createResolver({
        settings: { literatureNoteContentTemplate: 'content' },
        vault: {
          getAbstractFileByPath: jest.fn(() => ({
            path: 'citation-content-template.md',
            name: 'citation-content-template.md',
          })),
        },
      });

      await resolver.migrateInlineToFile();

      expect(mocks.vault.create).not.toHaveBeenCalled();
      expect(mocks.settings.literatureNoteContentTemplatePath).toBe(
        'citation-content-template.md',
      );
    });

    it('handles create failure gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const { resolver, mocks } = createResolver({
        settings: { literatureNoteContentTemplate: 'content' },
        vault: {
          getAbstractFileByPath: jest.fn(() => null),
          create: jest.fn(() => Promise.reject(new Error('disk full'))),
        },
      });

      await resolver.migrateInlineToFile();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to migrate'),
        expect.anything(),
      );
      expect(mocks.saveSettings).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('ensureDefaultTemplate', () => {
    it('creates default template file when missing', async () => {
      const { resolver, mocks } = createResolver();

      await resolver.ensureDefaultTemplate();

      expect(mocks.vault.create).toHaveBeenCalledWith(
        'citation-content-template.md',
        DEFAULT_CONTENT_TEMPLATE,
      );
      expect(mocks.settings.literatureNoteContentTemplatePath).toBe(
        'citation-content-template.md',
      );
      expect(mocks.saveSettings).toHaveBeenCalled();
    });

    it('does not create file if it already exists', async () => {
      const { resolver, mocks } = createResolver({
        vault: {
          getAbstractFileByPath: jest.fn(() => ({
            path: 'citation-content-template.md',
            name: 'citation-content-template.md',
          })),
        },
      });

      await resolver.ensureDefaultTemplate();

      expect(mocks.vault.create).not.toHaveBeenCalled();
      expect(mocks.saveSettings).toHaveBeenCalled();
    });

    it('handles create failure gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const { resolver, mocks } = createResolver({
        vault: {
          getAbstractFileByPath: jest.fn(() => null),
          create: jest.fn(() => Promise.reject(new Error('disk full'))),
        },
      });

      await resolver.ensureDefaultTemplate();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create default template'),
        expect.anything(),
      );
      expect(mocks.saveSettings).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
