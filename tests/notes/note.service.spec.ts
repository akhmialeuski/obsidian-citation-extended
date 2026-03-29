/** @jest-environment jsdom */
import { NoteService } from '../../src/notes/note.service';
import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { Library, Entry, TemplateContext } from '../../src/core';
import {
  TemplateRenderError,
  LiteratureNoteNotFoundError,
  EntryNotFoundError,
} from '../../src/core/errors';
import {
  createMockPlatformAdapter,
  IPlatformAdapter,
  IVaultFile,
} from '../helpers/mock-platform';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    TFile: class {},
    TFolder: class {},
    normalizePath: (path: string) => path,
    PluginSettingTab: class {},
    Setting: class {},
  }),
  { virtual: true },
);

describe('NoteService', () => {
  let noteService: NoteService;
  let platform: IPlatformAdapter;
  let settings: CitationsPluginSettings;
  let templateService: TemplateService;
  let library: Library;

  beforeEach(() => {
    platform = createMockPlatformAdapter();
    settings = new CitationsPluginSettings();
    settings.literatureNoteFolder = 'Reading notes';

    templateService = new TemplateService(settings);
    // Mock templateService methods to avoid complex setup
    jest
      .spyOn(templateService, 'getTemplateVariables')
      .mockReturnValue({} as unknown as TemplateContext);
    jest
      .spyOn(templateService, 'getTitle')
      .mockReturnValue({ ok: true, value: 'My Title' });
    jest
      .spyOn(templateService, 'render')
      .mockReturnValue({ ok: true, value: 'My Content' });

    noteService = new NoteService(platform, settings, templateService);

    library = new Library({
      citekey1: { id: 'citekey1' } as Entry,
    });
  });

  test('getPathForCitekey returns correct path', () => {
    const result = noteService.getPathForCitekey('citekey1', library);
    // Normalize separators for cross-platform compatibility
    const normalized = result.replace(/\\/g, '/');
    expect(normalized).toBe('Reading notes/My Title.md');
  });

  test('getPathForCitekey truncates long filenames', () => {
    const longTitle = 'A'.repeat(250);
    jest
      .spyOn(templateService, 'getTitle')
      .mockReturnValue({ ok: true, value: longTitle });

    const result = noteService.getPathForCitekey('citekey1', library);
    const normalized = result.replace(/\\/g, '/');
    const filename = normalized.split('/').pop()!;
    // 200 chars max + .md = 203 total
    expect(filename.length).toBeLessThanOrEqual(203);
  });

  test('getPathForCitekey replaces disallowed filename characters', () => {
    jest
      .spyOn(templateService, 'getTitle')
      .mockReturnValue({ ok: true, value: 'Title: with * special < chars >' });

    const result = noteService.getPathForCitekey('citekey1', library);
    expect(result).not.toContain(':');
    expect(result).not.toContain('*');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  test('getPathForCitekey throws EntryNotFoundError for unknown citekey', () => {
    expect(() => noteService.getPathForCitekey('nonexistent', library)).toThrow(
      EntryNotFoundError,
    );
  });

  test('getPathForCitekey throws TemplateRenderError on bad template', () => {
    jest.spyOn(templateService, 'getTitle').mockReturnValue({
      ok: false,
      error: new TemplateRenderError('bad template'),
    });

    expect(() => noteService.getPathForCitekey('citekey1', library)).toThrow(
      TemplateRenderError,
    );
  });

  describe('subfolder support in title template', () => {
    it('produces correct path when title contains a forward slash', () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/article/smith2023.md');
    });

    it('produces correct path with multiple subfolder levels', () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'journal/2024/smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/journal/2024/smith2023.md');
    });

    it('strips empty segments caused by consecutive slashes', () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article//smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/article/smith2023.md');
    });

    it('strips whitespace-only segments', () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/ /smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/article/smith2023.md');
    });

    it('sanitizes disallowed characters independently in each segment', () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Art:icle/smi*th2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Art_icle/smi_th2023.md');
    });

    it('truncates each segment independently to MAX_FILENAME_LENGTH', () => {
      const longSegment = 'B'.repeat(250);
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: `${longSegment}/citekey` });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      const parts = normalized.split('/');
      // parts: ["Reading notes", <truncated>, "citekey.md"]
      expect(parts[1].length).toBeLessThanOrEqual(200);
      expect(parts[2]).toBe('citekey.md');
    });
  });

  describe('getOrCreateLiteratureNoteFile', () => {
    it('calls templateService.render when creating a new file', async () => {
      const mockFile: IVaultFile = {
        path: 'Reading notes/My Title.md',
        name: 'My Title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
      (platform.vault.createFolder as jest.Mock).mockResolvedValue(undefined);
      (platform.vault.create as jest.Mock).mockResolvedValue(mockFile);

      const renderSpy = jest.spyOn(templateService, 'render');

      await noteService.getOrCreateLiteratureNoteFile('citekey1', library);

      expect(renderSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({}),
      );
      expect(platform.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('My Title.md'),
        'My Content',
      );
    });

    it('throws TemplateRenderError when render fails on new file', async () => {
      jest.spyOn(templateService, 'render').mockReturnValue({
        ok: false,
        error: new TemplateRenderError('bad render'),
      });

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
      (platform.vault.createFolder as jest.Mock).mockResolvedValue(undefined);

      await expect(
        noteService.getOrCreateLiteratureNoteFile('citekey1', library),
      ).rejects.toThrow(TemplateRenderError);
    });

    it('finds a note moved to a subfolder via recursive search', async () => {
      // The note was moved from "Reading notes/My Title.md"
      // to "Reading notes/archive/My Title.md"
      const movedFile: IVaultFile = {
        path: 'Reading notes/archive/My Title.md',
        name: 'My Title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.isFile as jest.Mock).mockReturnValue(false);
      // But the file exists under a subfolder
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([
        movedFile,
      ]);

      const result = await noteService.getOrCreateLiteratureNoteFile(
        'citekey1',
        library,
      );

      expect(result).toBe(movedFile);
      // Should NOT have created a new file
      expect(platform.vault.create).not.toHaveBeenCalled();
    });

    it('creates note in correct subfolder when title template includes path separators', async () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/smith2023' });

      const mockFile: IVaultFile = {
        path: 'Reading notes/article/smith2023.md',
        name: 'smith2023.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock)
        // First call: exact path lookup for the note — not found
        .mockReturnValueOnce(null)
        // findExistingLiteratureNoteFile second path (isFile check) — not applicable
        // ensureFolderExists checks "Reading notes" parent
        .mockReturnValueOnce(null) // isFolder check
        .mockReturnValueOnce({ path: 'Reading notes' }) // ensureFolderExists parent
        .mockReturnValueOnce(null); // ensureFolderExists child
      (platform.vault.isFile as jest.Mock).mockReturnValue(false);
      (platform.vault.isFolder as jest.Mock).mockReturnValue(false);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
      (platform.vault.createFolder as jest.Mock).mockResolvedValue(undefined);
      (platform.vault.create as jest.Mock).mockResolvedValue(mockFile);

      const result = await noteService.getOrCreateLiteratureNoteFile(
        'citekey1',
        library,
      );

      expect(result).toBe(mockFile);
      expect(platform.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('article'),
        'My Content',
      );
    });

    it('finds notes outside the literature note folder via vault-wide search (#256)', async () => {
      // A file with the same name exists outside the literature note folder
      const outsideFile: IVaultFile = {
        path: 'Other folder/My Title.md',
        name: 'My Title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.isFile as jest.Mock).mockReturnValue(false);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([
        outsideFile,
      ]);

      const result = await noteService.getOrCreateLiteratureNoteFile(
        'citekey1',
        library,
      );

      // Vault-wide fallback should find the moved note without creating a duplicate
      expect(result).toBe(outsideFile);
      expect(platform.vault.create).not.toHaveBeenCalled();
    });
  });

  describe('findExistingLiteratureNoteFile', () => {
    it('returns IVaultFile when found by exact path', () => {
      const mockFile: IVaultFile = {
        path: 'Reading notes/My Title.md',
        name: 'My Title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (platform.vault.isFile as jest.Mock).mockReturnValue(true);

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBe(mockFile);
    });

    it('returns IVaultFile when found by case-insensitive match', () => {
      const mockFile: IVaultFile = {
        path: 'reading notes/my title.md',
        name: 'my title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([
        mockFile,
      ]);

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBe(mockFile);
    });

    it('returns null when note does not exist', () => {
      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBeNull();
    });

    it('returns null when path matches a non-file abstract file', () => {
      const notAFile: IVaultFile = {
        path: 'Reading notes/My Title.md',
        name: 'My Title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        notAFile,
      );
      // isFile returns false — simulates a folder or other abstract file
      (platform.vault.isFile as jest.Mock).mockReturnValue(false);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBeNull();
    });
  });

  describe('openLiteratureNote', () => {
    it('propagates errors from getOrCreateLiteratureNoteFile', async () => {
      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
      (platform.vault.createFolder as jest.Mock).mockRejectedValue(
        new Error('Disk full'),
      );
      (platform.vault.create as jest.Mock).mockRejectedValue(
        new Error('Disk full'),
      );

      await expect(
        noteService.openLiteratureNote('citekey1', library, false),
      ).rejects.toThrow();
    });

    it('opens the file in the requested pane on success', async () => {
      const mockFile: IVaultFile = {
        path: 'Reading notes/My Title.md',
        name: 'My Title.md',
      };

      (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (platform.vault.isFile as jest.Mock).mockReturnValue(true);

      await noteService.openLiteratureNote('citekey1', library, true);

      expect(platform.workspace.openFile).toHaveBeenCalledWith(mockFile, true);
    });

    describe('with disableAutomaticNoteCreation enabled', () => {
      beforeEach(() => {
        settings.disableAutomaticNoteCreation = true;
      });

      it('opens existing note without creating a new one', async () => {
        const mockFile: IVaultFile = {
          path: 'Reading notes/My Title.md',
          name: 'My Title.md',
        };

        (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
          mockFile,
        );
        (platform.vault.isFile as jest.Mock).mockReturnValue(true);

        await noteService.openLiteratureNote('citekey1', library, false);

        expect(platform.workspace.openFile).toHaveBeenCalledWith(
          mockFile,
          false,
        );
        expect(platform.vault.create).not.toHaveBeenCalled();
      });

      it('throws LiteratureNoteNotFoundError when note does not exist', async () => {
        (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
          null,
        );
        (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

        await expect(
          noteService.openLiteratureNote('citekey1', library, false),
        ).rejects.toThrow(LiteratureNoteNotFoundError);
      });
    });

    describe('with disableAutomaticNoteCreation disabled (default)', () => {
      it('creates note when it does not exist', async () => {
        const mockFile: IVaultFile = {
          path: 'Reading notes/My Title.md',
          name: 'My Title.md',
        };

        (platform.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
          null,
        );
        (platform.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
        (platform.vault.createFolder as jest.Mock).mockResolvedValue(undefined);
        (platform.vault.create as jest.Mock).mockResolvedValue(mockFile);

        await noteService.openLiteratureNote('citekey1', library, false);

        expect(platform.vault.create).toHaveBeenCalled();
        expect(platform.workspace.openFile).toHaveBeenCalledWith(
          mockFile,
          false,
        );
      });
    });
  });
});
