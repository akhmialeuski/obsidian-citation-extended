import { NoteService } from '../note.service';
import { TemplateService } from '../template.service';
import { CitationsPluginSettings } from '../../settings';
import { Library, Entry } from '../../types';
import { App } from 'obsidian';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    TFile: class {},
    normalizePath: (path: string) => path,
    Notice: class {},
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValue({} as unknown as any); // TemplateContext is complex to mock fully
    jest.spyOn(templateService, 'getTitle').mockReturnValue('My Title');
    jest.spyOn(templateService, 'getContent').mockReturnValue('My Content');

    noteService = new NoteService(app, settings, templateService);

    library = new Library({
      citekey1: { id: 'citekey1' } as Entry,
    });
  });

  test('getPathForCitekey returns correct path', () => {
    const path = noteService.getPathForCitekey('citekey1', library);
    expect(path).toBe('Reading notes/My Title.md');
  });
});
