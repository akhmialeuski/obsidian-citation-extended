/**
 * Regression test for: Data slashes collide with template slashes in path mode
 * Origin: QA defect finding during review of sanitizeTitlePath refactor
 * Root cause: When hasPathSegments=true, the rendered string is split by '/'
 *   which cannot distinguish between template-originated and data-originated
 *   slashes. A title like "A / B" in a template with path separators creates
 *   unintended subdirectories instead of replacing data slashes with '_'.
 */

/** @jest-environment jsdom */
import { NoteService } from '../../../src/notes/note.service';
import { TemplateService } from '../../../src/template/template.service';
import { CitationsPluginSettings } from '../../../src/ui/settings/settings';
import { Library, Entry, TemplateContext } from '../../../src/core';
import { createMockPlatformAdapter } from '../../helpers/mock-platform';

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

describe('Regression: data slashes collide with template slashes', () => {
  let noteService: NoteService;
  let settings: CitationsPluginSettings;
  let templateService: TemplateService;
  let library: Library;

  beforeEach(() => {
    const platform = createMockPlatformAdapter();
    settings = new CitationsPluginSettings();
    settings.literatureNoteFolder = 'Reading notes';

    templateService = new TemplateService(settings);
    jest
      .spyOn(templateService, 'getTemplateVariables')
      .mockReturnValue({} as unknown as TemplateContext);
    jest
      .spyOn(templateService, 'render')
      .mockReturnValue({ ok: true, value: '' });

    noteService = new NoteService(platform, settings, templateService);

    library = new Library({
      entry1: { id: 'entry1' } as Entry,
    });
  });

  /**
   * When a template has a literal `/` (e.g. `{{type}}/{{title}}`), and a
   * variable value also contains `/` (e.g. title = "Author A / Author B"),
   * the rendered result is "article/Author A / Author B". Splitting by `/`
   * produces ["article", "Author A ", " Author B"] which incorrectly creates
   * two subdirectories instead of one.
   *
   * Expected correct behavior: template slashes create subdirectories,
   * but data slashes are replaced with '_' → "article/Author A _ Author B".
   *
   * Marked as .failing() until the developer fixes the code.
   */
  it.failing(
    'should not create extra subdirectories from slashes in variable data',
    () => {
      settings.literatureNoteTitleTemplate = '{{type}}/{{title}}';
      // Simulates rendered output: "article/Author A / Author B"
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: 'article/Author A / Author B' });

      const result = noteService.getPathForCitekey('entry1', library);
      const normalized = result.replace(/\\/g, '/');
      // Correct: one subdirectory "article", filename "Author A _ Author B.md"
      expect(normalized).toBe('Reading notes/article/Author A _ Author B.md');
    },
  );

  it.failing(
    'should handle multiple data slashes in a multi-segment template',
    () => {
      settings.literatureNoteTitleTemplate = '{{year}}/{{type}}/{{title}}';
      // Simulates: year=2024, type=article, title="A / B / C"
      // Rendered: "2024/article/A / B / C"
      jest
        .spyOn(templateService, 'getTitle')
        .mockReturnValue({ ok: true, value: '2024/article/A / B / C' });

      const result = noteService.getPathForCitekey('entry1', library);
      const normalized = result.replace(/\\/g, '/');
      // Correct: two subdirectories "2024/article", filename "A _ B _ C.md"
      expect(normalized).toBe('Reading notes/2024/article/A _ B _ C.md');
    },
  );
});
