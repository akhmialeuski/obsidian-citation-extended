import { TemplateService } from '../services/template.service';
import { CitationsPluginSettings } from '../settings';
import { TemplateContext, Entry } from '../types';

describe('TemplateService', () => {
  let service: TemplateService;
  const mockSettings = {
    literatureNoteTitleTemplate: '{{title}}',
    literatureNoteContentTemplate: '{{title}}',
    markdownCitationTemplate: '{{title}}',
    alternativeMarkdownCitationTemplate: '{{title}}',
  } as CitationsPluginSettings;

  const mockContext: TemplateContext = {
    citekey: 'test',
    type: 'book',
    zoteroSelectURI: 'zotero://select/items/@test',
    entry: {},
  };

  beforeEach(() => {
    service = new TemplateService(mockSettings);
  });

  describe('Comparison Helpers', () => {
    it('should handle eq helper', () => {
      expect(
        service.render('{{#if (eq 1 1)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('true');
      expect(
        service.render('{{#if (eq 1 2)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('false');
    });

    it('should handle ne helper', () => {
      expect(
        service.render('{{#if (ne 1 2)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('true');
      expect(
        service.render('{{#if (ne 1 1)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('false');
    });

    it('should handle gt helper', () => {
      expect(
        service.render('{{#if (gt 2 1)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('true');
      expect(
        service.render('{{#if (gt 1 2)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('false');
    });

    it('should handle lt helper', () => {
      expect(
        service.render('{{#if (lt 1 2)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('true');
      expect(
        service.render('{{#if (lt 2 1)}}true{{else}}false{{/if}}', mockContext),
      ).toBe('false');
    });

    it('should handle gte helper', () => {
      expect(
        service.render(
          '{{#if (gte 2 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (gte 1 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (gte 1 2)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('false');
    });

    it('should handle lte helper', () => {
      expect(
        service.render(
          '{{#if (lte 1 2)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (lte 1 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (lte 2 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('false');
    });
  });

  describe('Boolean Helpers', () => {
    it('should handle and helper', () => {
      expect(
        service.render(
          '{{#if (and true true)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (and true false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('false');
      expect(
        service.render(
          '{{#if (and true true true)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
    });

    it('should handle or helper', () => {
      expect(
        service.render(
          '{{#if (or true false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (or false false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('false');
    });

    it('should handle not helper', () => {
      expect(
        service.render(
          '{{#if (not false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (not true)}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('false');
    });
  });

  describe('String Helpers', () => {
    it('should handle replace helper', () => {
      expect(
        service.render(
          '{{replace "hello world" "world" "universe"}}',
          mockContext,
        ),
      ).toBe('hello universe');
      expect(
        service.render('{{replace "hello world" "o" "a"}}', mockContext),
      ).toBe('hella warld');
    });

    it('should handle truncate helper', () => {
      expect(service.render('{{truncate "hello world" 5}}', mockContext)).toBe(
        'hello',
      );
      expect(service.render('{{truncate "hello" 10}}', mockContext)).toBe(
        'hello',
      );
    });
  });

  describe('Regex Helpers', () => {
    it('should handle match helper', () => {
      expect(
        service.render('{{match "hello world" "hello"}}', mockContext),
      ).toBe('hello');
      expect(
        service.render('{{match "hello world" "\\w+"}}', mockContext),
      ).toBe('hello');
      expect(
        service.render('{{match "hello world" "universe"}}', mockContext),
      ).toBe('');
    });
  });

  describe('Nested Helpers', () => {
    it('should handle nested helpers', () => {
      expect(
        service.render(
          '{{#if (and (eq 1 1) (gt 2 1))}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
      expect(
        service.render(
          '{{#if (or (eq 1 2) (lt 1 2))}}true{{else}}false{{/if}}',
          mockContext,
        ),
      ).toBe('true');
    });
  });
  describe('Path Helpers', () => {
    it('should handle urlEncode helper', () => {
      expect(service.render('{{urlEncode "hello world"}}', mockContext)).toBe(
        'hello%20world',
      );
    });

    it('should handle basename helper', () => {
      expect(
        service.render('{{basename "/path/to/file.pdf"}}', mockContext),
      ).toBe('file.pdf');
      expect(
        service.render('{{basename "C:\\path\\to\\file.pdf"}}', mockContext),
      ).toBe('file.pdf');
    });

    it('should handle filename helper', () => {
      expect(
        service.render('{{filename "/path/to/file.pdf"}}', mockContext),
      ).toBe('file');
      expect(
        service.render('{{filename "C:\\path\\to\\file.pdf"}}', mockContext),
      ).toBe('file');
    });

    it('should handle dirname helper', () => {
      expect(
        service.render('{{dirname "/path/to/file.pdf"}}', mockContext),
      ).toBe('/path/to');
      expect(
        service.render('{{dirname "C:\\path\\to\\file.pdf"}}', mockContext),
      ).toBe('C:\\path\\to');
    });
  });

  describe('Template Variables', () => {
    it('should export series and volume shortcuts', () => {
      const entryMock = {
        id: 'citekey',
        title: 'Title',
        series: 'My Series',
        volume: '123',
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.series).toBe('My Series');
      expect(vars.volume).toBe('123');
    });
  });
});
