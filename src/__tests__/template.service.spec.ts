import { TemplateService } from '../services/template.service';
import { CitationsPluginSettings } from '../settings';
import { TemplateContext, Entry } from '../types';
import { Result } from '../result';

function expectOk<T>(result: Result<T>, expected: T) {
  expect(result).toEqual({ ok: true, value: expected });
}

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
      expectOk(
        service.render('{{#if (eq 1 1)}}true{{else}}false{{/if}}', mockContext),
        'true',
      );
      expectOk(
        service.render('{{#if (eq 1 2)}}true{{else}}false{{/if}}', mockContext),
        'false',
      );
    });

    it('should handle ne helper', () => {
      expectOk(
        service.render('{{#if (ne 1 2)}}true{{else}}false{{/if}}', mockContext),
        'true',
      );
      expectOk(
        service.render('{{#if (ne 1 1)}}true{{else}}false{{/if}}', mockContext),
        'false',
      );
    });

    it('should handle gt helper', () => {
      expectOk(
        service.render('{{#if (gt 2 1)}}true{{else}}false{{/if}}', mockContext),
        'true',
      );
      expectOk(
        service.render('{{#if (gt 1 2)}}true{{else}}false{{/if}}', mockContext),
        'false',
      );
    });

    it('should handle lt helper', () => {
      expectOk(
        service.render('{{#if (lt 1 2)}}true{{else}}false{{/if}}', mockContext),
        'true',
      );
      expectOk(
        service.render('{{#if (lt 2 1)}}true{{else}}false{{/if}}', mockContext),
        'false',
      );
    });

    it('should handle gte helper', () => {
      expectOk(
        service.render(
          '{{#if (gte 2 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (gte 1 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (gte 1 2)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'false',
      );
    });

    it('should handle lte helper', () => {
      expectOk(
        service.render(
          '{{#if (lte 1 2)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (lte 1 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (lte 2 1)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'false',
      );
    });
  });

  describe('Boolean Helpers', () => {
    it('should handle and helper', () => {
      expectOk(
        service.render(
          '{{#if (and true true)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (and true false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'false',
      );
      expectOk(
        service.render(
          '{{#if (and true true true)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
    });

    it('should handle or helper', () => {
      expectOk(
        service.render(
          '{{#if (or true false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (or false false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'false',
      );
    });

    it('should handle not helper', () => {
      expectOk(
        service.render(
          '{{#if (not false)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (not true)}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'false',
      );
    });
  });

  describe('String Helpers', () => {
    it('should handle replace helper', () => {
      expectOk(
        service.render(
          '{{replace "hello world" "world" "universe"}}',
          mockContext,
        ),
        'hello universe',
      );
      expectOk(
        service.render('{{replace "hello world" "o" "a"}}', mockContext),
        'hella warld',
      );
    });

    it('should handle truncate helper', () => {
      expectOk(
        service.render('{{truncate "hello world" 5}}', mockContext),
        'hello',
      );
      expectOk(service.render('{{truncate "hello" 10}}', mockContext), 'hello');
    });
  });

  describe('Regex Helpers', () => {
    it('should handle match helper', () => {
      expectOk(
        service.render('{{match "hello world" "hello"}}', mockContext),
        'hello',
      );
      expectOk(
        service.render('{{match "hello world" "\\w+"}}', mockContext),
        'hello',
      );
      expectOk(
        service.render('{{match "hello world" "universe"}}', mockContext),
        '',
      );
    });
  });

  describe('Nested Helpers', () => {
    it('should handle nested helpers', () => {
      expectOk(
        service.render(
          '{{#if (and (eq 1 1) (gt 2 1))}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
      expectOk(
        service.render(
          '{{#if (or (eq 1 2) (lt 1 2))}}true{{else}}false{{/if}}',
          mockContext,
        ),
        'true',
      );
    });
  });
  describe('Path Helpers', () => {
    it('should handle urlEncode helper', () => {
      expectOk(
        service.render('{{urlEncode "hello world"}}', mockContext),
        'hello%20world',
      );
    });

    it('should handle basename helper', () => {
      expectOk(
        service.render('{{basename "/path/to/file.pdf"}}', mockContext),
        'file.pdf',
      );
      expectOk(
        service.render('{{basename "C:\\path\\to\\file.pdf"}}', mockContext),
        'file.pdf',
      );
    });

    it('should handle filename helper', () => {
      expectOk(
        service.render('{{filename "/path/to/file.pdf"}}', mockContext),
        'file',
      );
      expectOk(
        service.render('{{filename "C:\\path\\to\\file.pdf"}}', mockContext),
        'file',
      );
    });

    it('should handle dirname helper', () => {
      expectOk(
        service.render('{{dirname "/path/to/file.pdf"}}', mockContext),
        '/path/to',
      );
      expectOk(
        service.render('{{dirname "C:\\path\\to\\file.pdf"}}', mockContext),
        'C:\\path\\to',
      );
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

    it('should export date shortcut in YYYY-MM-DD format', () => {
      const entryMock = {
        id: 'citekey',
        title: 'Title',
        issuedDate: new Date('2023-01-01T12:00:00Z'),
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.date).toBe('2023-01-01');
    });

    it('should handle missing issuedDate for date shortcut', () => {
      const entryMock = {
        id: 'citekey',
        title: 'Title',
        issuedDate: null,
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.date).toBeNull();
    });
  });
});
