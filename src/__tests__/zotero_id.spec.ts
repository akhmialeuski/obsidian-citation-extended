import {
  EntryCSLAdapter,
  EntryBibLaTeXAdapter,
  EntryDataCSL,
  EntryDataBibLaTeX,
} from '../types';
import { TemplateService } from '../services/template.service';
import { CitationsPluginSettings } from '../settings';

describe('Zotero ID Support', () => {
  const mockSettings = {
    literatureNoteTitleTemplate: '',
    literatureNoteContentTemplate: '{{zoteroId}}',
    markdownCitationTemplate: '',
    alternativeMarkdownCitationTemplate: '',
  } as unknown as CitationsPluginSettings;

  const templateService = new TemplateService(mockSettings);

  describe('EntryCSLAdapter', () => {
    it('should extract zoteroId from zotero-key in CSL data', () => {
      const cslData: EntryDataCSL = {
        id: 'citekey123',
        type: 'article-journal',
        title: 'Test Title',
        'zotero-key': 'ZOTERO_ID_123',
      };

      const entry = new EntryCSLAdapter(cslData);
      expect(entry.zoteroId).toBe('ZOTERO_ID_123');

      const variables = templateService.getTemplateVariables(entry);
      expect(variables.zoteroId).toBe('ZOTERO_ID_123');
      const renderResult1 = templateService.render('{{zoteroId}}', variables);
      expect(renderResult1.ok).toBe(true);
      if (renderResult1.ok) expect(renderResult1.value).toBe('ZOTERO_ID_123');
    });

    it('should be undefined if zotero-key is missing', () => {
      const cslData: EntryDataCSL = {
        id: 'citekey123',
        type: 'article-journal',
        title: 'Test Title',
      };

      const entry = new EntryCSLAdapter(cslData);
      expect(entry.zoteroId).toBeUndefined();

      const variables = templateService.getTemplateVariables(entry);
      expect(variables.zoteroId).toBeUndefined();
    });
  });

  describe('EntryBibLaTeXAdapter', () => {
    it('should extract zoteroId from zotero-key field in BibLaTeX data', () => {
      const bibData: EntryDataBibLaTeX = {
        key: 'citekey456',
        type: 'article',
        creators: { author: [] },
        fields: {
          title: ['Test Title'],
          'zotero-key': ['ZOTERO_ID_456'],
        },
      } as unknown as EntryDataBibLaTeX;

      const entry = new EntryBibLaTeXAdapter(bibData);
      expect(entry.zoteroId).toBe('ZOTERO_ID_456');

      const variables = templateService.getTemplateVariables(entry);
      expect(variables.zoteroId).toBe('ZOTERO_ID_456');
      const renderResult2 = templateService.render('{{zoteroId}}', variables);
      expect(renderResult2.ok).toBe(true);
      if (renderResult2.ok) expect(renderResult2.value).toBe('ZOTERO_ID_456');
    });

    it('should be undefined if zotero-key is missing', () => {
      const bibData: EntryDataBibLaTeX = {
        key: 'citekey456',
        type: 'article',
        creators: { author: [] },
        fields: {
          title: ['Test Title'],
        },
      } as unknown as EntryDataBibLaTeX;

      const entry = new EntryBibLaTeXAdapter(bibData);
      expect(entry.zoteroId).toBeUndefined();

      const variables = templateService.getTemplateVariables(entry);
      expect(variables.zoteroId).toBeUndefined();
    });
  });
});
