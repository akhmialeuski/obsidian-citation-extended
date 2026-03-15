// Mock obsidian module first
jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    Plugin: class {},
    PluginSettingTab: class {},
    Setting: class {},
    Platform: { isMobile: false },
    normalizePath: (path: string) => path,
  }),
  { virtual: true },
);

import { TemplateService } from '../services/template.service';
import { CitationsPluginSettings, DEFAULT_SETTINGS } from '../settings';
import { Entry } from '../core';

describe('YAML Colon Handling', () => {
  let templateService: TemplateService;
  let settings: CitationsPluginSettings;

  beforeEach(() => {
    settings = new CitationsPluginSettings();
    templateService = new TemplateService(settings);
  });

  const mockEntry: Entry = {
    id: 'test-id',
    type: 'article-journal',
    title: 'My Title: A Subtitle',
    authorString: 'John Doe',
    year: 2021,
    toJSON: () => mockEntry,
  } as unknown as Entry;

  test('should generate valid YAML with default template when title has colon', () => {
    settings.literatureNoteContentTemplate =
      DEFAULT_SETTINGS.literatureNoteContentTemplate;
    const variables = templateService.getTemplateVariables(mockEntry);
    const contentResult = templateService.getContent(variables);

    expect(contentResult.ok).toBe(true);
    if (!contentResult.ok) return;
    const content = contentResult.value;

    expect(content).toContain('title: "My Title: A Subtitle"');

    const titleLine = content
      .split('\n')
      .find((line: string) => line.startsWith('title:'));
    expect(titleLine).toBe('title: "My Title: A Subtitle"');
  });

  test('should quote title correctly if it contains quotes', () => {
    const entryWithQuotes = {
      ...mockEntry,
      title: 'My "Quoted" Title',
      toJSON: () => entryWithQuotes,
    } as unknown as Entry;
    settings.literatureNoteContentTemplate =
      DEFAULT_SETTINGS.literatureNoteContentTemplate;

    const variables = templateService.getTemplateVariables(entryWithQuotes);
    const contentResult = templateService.getContent(variables);

    expect(contentResult.ok).toBe(true);
    if (!contentResult.ok) return;

    expect(contentResult.value).toContain('title: "My \\"Quoted\\" Title"');
  });
});
