/** @jest-environment jsdom */
import { NoteService } from '../../src/notes/note.service';
import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { Library, Entry, TemplateContext } from '../../src/core';
import { TemplateRenderError } from '../../src/core/errors';
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
      .spyOn(templateService, 'getContent')
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
  });
});
