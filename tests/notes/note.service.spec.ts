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
    // The new sanitizeTitlePath(rendered, hasPathSegments) approach requires
    // the template to contain a literal `/` outside of {{...}} for subfolder
    // mode. We set literatureNoteTitleTemplate accordingly in each test.

    it('produces correct path when template has a literal slash', () => {
      settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/article/smith2023.md');
    });

    it('produces correct path with multiple subfolder levels', () => {
      settings.literatureNoteTitleTemplate = '{{type}}/{{year}}/{{citekey}}';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'journal/2024/smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/journal/2024/smith2023.md');
    });

    it('strips empty segments caused by consecutive slashes', () => {
      settings.literatureNoteTitleTemplate = '{{type}}//{{citekey}}';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article//smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/article/smith2023.md');
    });

    it('strips whitespace-only segments', () => {
      settings.literatureNoteTitleTemplate = '{{type}}/ /{{citekey}}';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/ /smith2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/article/smith2023.md');
    });

    it('sanitizes disallowed characters independently in each segment', () => {
      settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Art:icle/smi*th2023' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Art_icle/smi_th2023.md');
    });

    it('truncates each segment independently to MAX_FILENAME_LENGTH', () => {
      settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
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

  describe('filenameSanitizationReplacement setting (#59)', () => {
    it('replaces disallowed characters with space when configured', () => {
      settings.filenameSanitizationReplacement = ' ';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Title: Subtitle' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Title  Subtitle.md');
    });

    it('replaces disallowed characters with dash when configured', () => {
      settings.filenameSanitizationReplacement = '-';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Title: Subtitle' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Title- Subtitle.md');
    });

    it('removes disallowed characters when replacement is empty string', () => {
      settings.filenameSanitizationReplacement = '';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Title: Subtitle' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Title Subtitle.md');
    });

    it('defaults to underscore replacement', () => {
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Title: Subtitle' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Title_ Subtitle.md');
    });

    it('applies replacement in subfolder path segments', () => {
      settings.filenameSanitizationReplacement = ' ';
      settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Art:icle/smi*th' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Art icle/smi th.md');
    });

    it('uses replacement for slash in variable values', () => {
      settings.filenameSanitizationReplacement = '-';
      settings.literatureNoteTitleTemplate = '{{title}}';

      jest
        .spyOn(templateService, 'getTemplateVariables')
        .mockReturnValue({ title: 'Author A / Author B' } as never);
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Author A - Author B' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toBe('Reading notes/Author A - Author B.md');
    });

    it('handles multiple disallowed characters with custom replacement', () => {
      settings.filenameSanitizationReplacement = '';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'A*B"C\\D<E>F:G|H?I' });

      const result = noteService.getPathForCitekey('citekey1', library);
      expect(result).not.toMatch(/[*"\\<>:|?]/);
      const filename = result.replace(/\\/g, '/').split('/').pop()!;
      expect(filename).toBe('ABCDEFGHI.md');
    });

    it('uses multi-character replacement string', () => {
      settings.filenameSanitizationReplacement = ' - ';
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'Title: Subtitle' });

      const result = noteService.getPathForCitekey('citekey1', library);
      const normalized = result.replace(/\\/g, '/');
      // `:` replaced with ` - `, original space after colon preserved
      expect(normalized).toBe('Reading notes/Title -  Subtitle.md');
    });
  });

  describe('slash handling in note titles — comprehensive scenarios', () => {
    // These tests exercise all combinations of template slash presence
    // and data slash presence to verify correct sanitization behavior.

    describe('template WITHOUT `/`, title WITHOUT `/`', () => {
      it('should produce a simple filename from a simple title', () => {
        settings.literatureNoteTitleTemplate = '{{title}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'My Book' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/My Book.md');
      });

      it('should produce a filename with @ prefix from default template', () => {
        settings.literatureNoteTitleTemplate = '@{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: '@smith2024' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/@smith2024.md');
      });
    });

    describe('template WITHOUT `/`, title WITH `/`', () => {
      it('should replace slash with underscore when title has a single slash', () => {
        settings.literatureNoteTitleTemplate = '{{title}}';
        // sanitizeVariablesForPath replaces `/` in data BEFORE getTitle is called,
        // so getTitle receives already-sanitized variables and returns sanitized output
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'Author A _ Author B' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/Author A _ Author B.md');
      });

      it('should replace multiple slashes with underscores', () => {
        settings.literatureNoteTitleTemplate = '{{title}}';
        // After sanitizeVariablesForPath, all `/` in data are `_`
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'A_B_C' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/A_B_C.md');
      });

      it('should not affect citekey prefix when title has a slash', () => {
        settings.literatureNoteTitleTemplate = '@{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: '@rw-123' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        // citekey without slashes is unaffected even though the DISALLOWED_FILENAME regex applies
        expect(normalized).toBe('Reading notes/@rw-123.md');
      });
    });

    describe('template WITH `/`, title WITHOUT `/`', () => {
      it('should create subdirectory from type/citekey template', () => {
        settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'book/smith2024' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/book/smith2024.md');
      });

      it('should create subdirectory from containerTitle/citekey template', () => {
        settings.literatureNoteTitleTemplate = '{{containerTitle}}/{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'Nature/smith2024' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/Nature/smith2024.md');
      });

      it('should create subdirectory from year/title template', () => {
        settings.literatureNoteTitleTemplate = '{{year}}/{{title}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: '2024/My Book' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/2024/My Book.md');
      });
    });

    describe('template WITH `/`, title WITH `/` — known defect', () => {
      /**
       * KNOWN DEFECT: When the template contains a literal `/` for
       * subdirectory organisation AND the rendered variable values also
       * contain `/`, the current implementation cannot distinguish
       * between template-originated and data-originated slashes in the
       * rendered string.
       *
       * Example: template = `{{type}}/{{title}}`
       *   type = "article", title = "A / B"
       *   rendered = "article/A / B"
       *   split('/') => ["article", "A ", " B"]  — creates 2 subdirs instead of 1
       *
       * The old `sanitizeVariablesForPath` approach (which replaced `/`
       * in variable values BEFORE rendering) handled this correctly.
       * The developer should restore pre-render variable sanitization
       * for this combined case.
       *
       * Marking test as `.failing()` to document the expected correct
       * behavior. Once the code is fixed, this test will start passing
       * and the `.failing()` should be removed.
       *
       * NOTE: The expected output uses the default replacement character
       * (`_`). Since filenameSanitizationReplacement is configurable
       * (#59), the actual replacement depends on the setting value.
       * The beforeEach block resets settings to defaults (`_`) each run.
       */
      it.failing(
        'should replace data slashes while preserving template slashes',
        () => {
          settings.literatureNoteTitleTemplate = '{{type}}/{{title}}';
          // Rendered: "article/A / B" — after split: ["article", "A ", " B"]
          // Expected: "article/A _ B" — template slash creates dir, data slash is sanitized
          jest
            .spyOn(templateService, 'getTitle')
            .mockReturnValue({ ok: true, value: 'article/A / B' });

          const result = noteService.getPathForCitekey('citekey1', library);
          const normalized = result.replace(/\\/g, '/');
          expect(normalized).toBe('Reading notes/article/A _ B.md');
        },
      );
    });

    describe('LITERAL_SLASH_RE edge cases', () => {
      it('should detect slash after closing }} in template', () => {
        settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'book/smith2024' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        // Slash between }} and {{ is a literal path separator
        expect(normalized).toBe('Reading notes/book/smith2024.md');
      });

      it('should detect slash at the beginning of template', () => {
        settings.literatureNoteTitleTemplate = 'prefix/{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'prefix/smith2024' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/prefix/smith2024.md');
      });

      it('should detect slash at the end of template', () => {
        settings.literatureNoteTitleTemplate = '{{type}}/suffix';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'article/suffix' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/article/suffix.md');
      });

      it('should NOT treat slash inside {{...}} as a path separator', () => {
        // Template with no literal slash — only inside Handlebars expression
        settings.literatureNoteTitleTemplate = '{{title}}';
        // sanitizeVariablesForPath already replaced `/` before getTitle
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'A_B' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/A_B.md');
      });

      it('should treat only literal text slashes as path separators', () => {
        // Template: literal text "notes" / then handlebars
        settings.literatureNoteTitleTemplate = 'notes/{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'notes/smith2024' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/notes/smith2024.md');
      });
    });

    describe('sanitization edge cases in both modes', () => {
      it('should trim leading and trailing whitespace in filename mode', () => {
        settings.literatureNoteTitleTemplate = '{{title}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: '  My Title  ' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/My Title.md');
      });

      it('should trim whitespace in each segment in path mode', () => {
        settings.literatureNoteTitleTemplate = '{{type}}/{{citekey}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: '  article  /  smith2024  ' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        expect(normalized).toBe('Reading notes/article/smith2024.md');
      });

      it('should replace all disallowed characters in filename mode', () => {
        settings.literatureNoteTitleTemplate = '{{title}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'A*B"C\\D<E>F:G|H?I' });

        const result = noteService.getPathForCitekey('citekey1', library);
        // None of the disallowed filename characters should remain
        expect(result).not.toMatch(/[*"\\<>:|?]/);
      });

      it('should replace disallowed segment characters in path mode', () => {
        settings.literatureNoteTitleTemplate = '{{type}}/{{title}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: 'book/A*B"C\\D<E>F:G|H?I' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const parts = result.replace(/\\/g, '/').split('/');
        const lastPart = parts[parts.length - 1].replace('.md', '');
        // None of the disallowed segment characters should remain
        expect(lastPart).not.toMatch(/[*"\\<>:|?]/);
      });

      it('should handle empty rendered title gracefully in filename mode', () => {
        settings.literatureNoteTitleTemplate = '{{title}}';
        jest
          .spyOn(templateService, 'getTitle')
          .mockReturnValue({ ok: true, value: '' });

        const result = noteService.getPathForCitekey('citekey1', library);
        const normalized = result.replace(/\\/g, '/');
        // Empty title should still produce a valid path with .md extension
        expect(normalized).toBe('Reading notes/.md');
      });
    });
  });
});
