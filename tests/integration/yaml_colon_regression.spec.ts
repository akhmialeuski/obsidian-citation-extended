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

import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { DEFAULT_CONTENT_TEMPLATE } from '../../src/ui/settings/settings-schema';
import { TestEntry } from '../helpers/mock-obsidian';

describe('YAML Colon Handling', () => {
  let templateService: TemplateService;
  let settings: CitationsPluginSettings;

  beforeEach(() => {
    settings = new CitationsPluginSettings();
    templateService = new TemplateService(settings);
  });

  const mockEntry = new TestEntry({
    id: 'test-id',
    type: 'article-journal',
    title: 'My Title: A Subtitle',
    authorString: 'John Doe',
    issuedDate: new Date('2021-01-01'),
  });

  test('should generate valid YAML with default template when title has colon', () => {
    const variables = templateService.getTemplateVariables(mockEntry);
    const contentResult = templateService.render(
      DEFAULT_CONTENT_TEMPLATE,
      variables,
    );

    expect(contentResult.ok).toBe(true);
    if (!contentResult.ok) return;
    const content = contentResult.value;

    expect(content).toContain('title: "My Title: A Subtitle"');
    expect(content).toContain('authors: "John Doe"');

    const titleLine = content
      .split('\n')
      .find((line: string) => line.startsWith('title:'));
    expect(titleLine).toBe('title: "My Title: A Subtitle"');
  });

  test('should generate valid YAML when authorString contains colon', () => {
    const entryWithColonAuthor = new TestEntry({
      id: 'test-id',
      type: 'article-journal',
      title: 'My Title: A Subtitle',
      authorString: 'Doe, J.: Editor',
      issuedDate: new Date('2021-01-01'),
    });

    const variables =
      templateService.getTemplateVariables(entryWithColonAuthor);
    const contentResult = templateService.render(
      DEFAULT_CONTENT_TEMPLATE,
      variables,
    );

    expect(contentResult.ok).toBe(true);
    if (!contentResult.ok) return;

    expect(contentResult.value).toContain('authors: "Doe, J.: Editor"');
  });

  test('should quote title correctly if it contains quotes', () => {
    const entryWithQuotes = new TestEntry({
      id: 'test-id',
      type: 'article-journal',
      title: 'My "Quoted" Title',
      authorString: 'John Doe',
      issuedDate: new Date('2021-01-01'),
    });

    const variables = templateService.getTemplateVariables(entryWithQuotes);
    const contentResult = templateService.render(
      DEFAULT_CONTENT_TEMPLATE,
      variables,
    );

    expect(contentResult.ok).toBe(true);
    if (!contentResult.ok) return;

    expect(contentResult.value).toContain('title: "My \\"Quoted\\" Title"');
  });
});
