/** @jest-environment jsdom */
import { NoteService } from '../../src/notes/note.service';
import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { Library, Entry, TemplateContext } from '../../src/core';
import {
  TemplateRenderError,
  LiteratureNoteNotFoundError,
} from '../../src/core/errors';
import { App } from 'obsidian';

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
  let app: App;
  let settings: CitationsPluginSettings;
  let templateService: TemplateService;
  let library: Library;

  beforeEach(() => {
    app = new App();
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

    noteService = new NoteService(app, settings, templateService);

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
      const mockFile = { path: 'Reading notes/My Title.md' };
      const { TFile } = jest.requireMock('obsidian');
      Object.setPrototypeOf(mockFile, TFile.prototype);

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => null),
        getMarkdownFiles: jest.fn(() => []),
        createFolder: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(mockFile),
      };

      const renderSpy = jest.spyOn(templateService, 'render');

      await noteService.getOrCreateLiteratureNoteFile('citekey1', library);

      expect(renderSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({}),
      );
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('My Title.md'),
        'My Content',
      );
    });

    it('throws TemplateRenderError when render fails on new file', async () => {
      jest.spyOn(templateService, 'render').mockReturnValue({
        ok: false,
        error: new TemplateRenderError('bad render'),
      });

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => null),
        getMarkdownFiles: jest.fn(() => []),
        createFolder: jest.fn().mockResolvedValue(undefined),
        create: jest.fn(),
      };

      await expect(
        noteService.getOrCreateLiteratureNoteFile('citekey1', library),
      ).rejects.toThrow(TemplateRenderError);
    });

    it('finds a note moved to a subfolder via recursive search', async () => {
      const { TFile } = jest.requireMock('obsidian');

      // The note was moved from "Reading notes/My Title.md"
      // to "Reading notes/archive/My Title.md"
      const movedFile = {
        path: 'Reading notes/archive/My Title.md',
        name: 'My Title.md',
      };
      Object.setPrototypeOf(movedFile, TFile.prototype);

      (app as unknown as Record<string, unknown>).vault = {
        // Exact path lookup returns null (not at expected location)
        getAbstractFileByPath: jest.fn(() => null),
        // But the file exists under a subfolder
        getMarkdownFiles: jest.fn(() => [movedFile]),
        createFolder: jest.fn().mockResolvedValue(undefined),
        create: jest.fn(),
      };

      const result = await noteService.getOrCreateLiteratureNoteFile(
        'citekey1',
        library,
      );

      expect(result).toBe(movedFile);
      // Should NOT have created a new file
      expect(app.vault.create).not.toHaveBeenCalled();
    });

    it('creates note in correct subfolder when title template includes path separators', async () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/smith2023' });

      const { TFile, TFolder } = jest.requireMock('obsidian');

      const mockFile = { path: 'Reading notes/article/smith2023.md' };
      Object.setPrototypeOf(mockFile, TFile.prototype);

      const existingFolder = {};
      Object.setPrototypeOf(existingFolder, TFolder.prototype);

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest
          .fn()
          // First call: exact path lookup for the note — not found
          .mockReturnValueOnce(null)
          // Second call: ensureFolderExists checks "Reading notes" parent
          .mockReturnValueOnce(existingFolder)
          // Third call: ensureFolderExists checks "Reading notes/article"
          .mockReturnValueOnce(null),
        getMarkdownFiles: jest.fn(() => []),
        createFolder: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(mockFile),
      };

      const result = await noteService.getOrCreateLiteratureNoteFile(
        'citekey1',
        library,
      );

      expect(result).toBe(mockFile);
      expect(app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('article'),
        'My Content',
      );
    });

    it('does not find notes outside the literature note folder', async () => {
      const { TFile } = jest.requireMock('obsidian');

      // A file with the same name exists outside the literature note folder
      const outsideFile = {
        path: 'Other folder/My Title.md',
        name: 'My Title.md',
      };

      const mockCreatedFile = { path: 'Reading notes/My Title.md' };
      Object.setPrototypeOf(mockCreatedFile, TFile.prototype);

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => null),
        getMarkdownFiles: jest.fn(() => [outsideFile]),
        createFolder: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(mockCreatedFile),
      };

      const result = await noteService.getOrCreateLiteratureNoteFile(
        'citekey1',
        library,
      );

      // Should create a new file, not return the outside file
      expect(result).toBe(mockCreatedFile);
      expect(app.vault.create).toHaveBeenCalled();
    });
  });

  describe('findExistingLiteratureNoteFile', () => {
    it('returns TFile when found by exact path', () => {
      const mockFile = { path: 'Reading notes/My Title.md' };
      const { TFile } = jest.requireMock('obsidian');
      Object.setPrototypeOf(mockFile, TFile.prototype);

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => mockFile),
        getMarkdownFiles: jest.fn(() => []),
      };

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBe(mockFile);
    });

    it('returns TFile when found by case-insensitive match', () => {
      const mockFile = { path: 'reading notes/my title.md' };
      const { TFile } = jest.requireMock('obsidian');
      Object.setPrototypeOf(mockFile, TFile.prototype);

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => null),
        getMarkdownFiles: jest.fn(() => [mockFile]),
      };

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBe(mockFile);
    });

    it('returns null when note does not exist', () => {
      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => null),
        getMarkdownFiles: jest.fn(() => []),
      };

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBeNull();
    });

    it('returns null when path matches a non-TFile abstract file', () => {
      const notAFile = { path: 'Reading notes/My Title.md' };
      // Not setting TFile prototype — simulates a folder or other abstract file

      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => notAFile),
        getMarkdownFiles: jest.fn(() => []),
      };

      const result = noteService.findExistingLiteratureNoteFile(
        'citekey1',
        library,
      );
      expect(result).toBeNull();
    });
  });

  describe('openLiteratureNote', () => {
    it('propagates errors from getOrCreateLiteratureNoteFile', async () => {
      // Mock vault so getOrCreateLiteratureNoteFile fails
      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => null),
        getMarkdownFiles: jest.fn(() => []),
        createFolder: jest.fn().mockRejectedValue(new Error('Disk full')),
        create: jest.fn().mockRejectedValue(new Error('Disk full')),
      };
      (app as unknown as Record<string, unknown>).workspace = {
        getLeaf: jest.fn(() => ({
          openFile: jest.fn(),
        })),
      };

      await expect(
        noteService.openLiteratureNote('citekey1', library, false),
      ).rejects.toThrow();
    });

    it('opens the file in the requested pane on success', async () => {
      const mockFile = { path: 'Reading notes/My Title.md' };
      const openFileFn = jest.fn();
      (app as unknown as Record<string, unknown>).vault = {
        getAbstractFileByPath: jest.fn(() => mockFile),
      };
      (app as unknown as Record<string, unknown>).workspace = {
        getLeaf: jest.fn(() => ({
          openFile: openFileFn,
        })),
      };

      // getAbstractFileByPath returns a mock that is not instanceof TFile,
      // so we need to make it pass the check
      const { TFile } = jest.requireMock('obsidian');
      Object.setPrototypeOf(mockFile, TFile.prototype);

      await noteService.openLiteratureNote('citekey1', library, true);

      expect(app.workspace.getLeaf).toHaveBeenCalledWith(true);
      expect(openFileFn).toHaveBeenCalledWith(mockFile);
    });

    describe('with disableAutomaticNoteCreation enabled', () => {
      beforeEach(() => {
        settings.disableAutomaticNoteCreation = true;
      });

      it('opens existing note without creating a new one', async () => {
        const mockFile = { path: 'Reading notes/My Title.md' };
        const { TFile } = jest.requireMock('obsidian');
        Object.setPrototypeOf(mockFile, TFile.prototype);

        const openFileFn = jest.fn();
        (app as unknown as Record<string, unknown>).vault = {
          getAbstractFileByPath: jest.fn(() => mockFile),
          getMarkdownFiles: jest.fn(() => []),
          create: jest.fn(),
        };
        (app as unknown as Record<string, unknown>).workspace = {
          getLeaf: jest.fn(() => ({
            openFile: openFileFn,
          })),
        };

        await noteService.openLiteratureNote('citekey1', library, false);

        expect(openFileFn).toHaveBeenCalledWith(mockFile);
        expect(app.vault.create).not.toHaveBeenCalled();
      });

      it('throws LiteratureNoteNotFoundError when note does not exist', async () => {
        (app as unknown as Record<string, unknown>).vault = {
          getAbstractFileByPath: jest.fn(() => null),
          getMarkdownFiles: jest.fn(() => []),
        };
        (app as unknown as Record<string, unknown>).workspace = {
          getLeaf: jest.fn(() => ({
            openFile: jest.fn(),
          })),
        };

        await expect(
          noteService.openLiteratureNote('citekey1', library, false),
        ).rejects.toThrow(LiteratureNoteNotFoundError);
      });
    });

    describe('with disableAutomaticNoteCreation disabled (default)', () => {
      it('creates note when it does not exist', async () => {
        const mockFile = { path: 'Reading notes/My Title.md' };
        const { TFile } = jest.requireMock('obsidian');
        Object.setPrototypeOf(mockFile, TFile.prototype);

        const openFileFn = jest.fn();
        (app as unknown as Record<string, unknown>).vault = {
          getAbstractFileByPath: jest.fn(() => null),
          getMarkdownFiles: jest.fn(() => []),
          createFolder: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue(mockFile),
        };
        (app as unknown as Record<string, unknown>).workspace = {
          getLeaf: jest.fn(() => ({
            openFile: openFileFn,
          })),
        };

        await noteService.openLiteratureNote('citekey1', library, false);

        expect(app.vault.create).toHaveBeenCalled();
        expect(openFileFn).toHaveBeenCalledWith(mockFile);
      });
    });
  });
});
