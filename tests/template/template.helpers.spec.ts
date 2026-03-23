import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { Entry, TemplateContext } from '../../src/core';
import { Result } from '../../src/core/result';
import { formatDate } from '../../src/template/helpers/date-helpers';

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

    it('should not throw on invalid regex in replace', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      expectOk(
        service.render('{{replace "hello" "[invalid" "x"}}', mockContext),
        'hello',
      );
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should not throw on invalid regex in match', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      expectOk(service.render('{{match "hello" "[invalid"}}', mockContext), '');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
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

    it('should export ISBN shortcut', () => {
      const entryMock = {
        id: 'citekey',
        ISBN: '978-3-16-148410-0',
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.ISBN).toBe('978-3-16-148410-0');
    });

    it('should export lastname as first author family name', () => {
      const entryMock = {
        id: 'citekey',
        author: [
          { given: 'John', family: 'Doe' },
          { given: 'Jane', family: 'Smith' },
        ],
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.lastname).toBe('Doe');
    });

    it('should handle missing author for lastname shortcut', () => {
      const entryMock = {
        id: 'citekey',
        author: undefined,
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.lastname).toBeUndefined();
    });

    it('should export selectedText when provided via extras', () => {
      const entryMock = {
        id: 'citekey',
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock, {
        selectedText: 'highlighted passage',
      });
      expect(vars.selectedText).toBe('highlighted passage');
    });

    it('should leave selectedText undefined when extras not provided', () => {
      const entryMock = {
        id: 'citekey',
        toJSON: () => ({}),
      } as unknown as Entry;

      const vars = service.getTemplateVariables(entryMock);
      expect(vars.selectedText).toBeUndefined();
    });

    it('should render ISBN in a template', () => {
      const result = service.render('ISBN: {{ISBN}}', {
        ISBN: '978-3-16-148410-0',
      } as unknown as TemplateContext);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('ISBN: 978-3-16-148410-0');
    });

    it('should render lastname in a template', () => {
      const result = service.render('Author: {{lastname}}', {
        lastname: 'Einstein',
      } as unknown as TemplateContext);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('Author: Einstein');
    });

    it('should render selectedText in a template', () => {
      const result = service.render('Note: {{selectedText}}', {
        selectedText: 'some selection',
      } as unknown as TemplateContext);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('Note: some selection');
    });
  });

  describe('Author Helpers — branch coverage', () => {
    it('formatNames returns empty string when authors is not an array', () => {
      expectOk(
        service.render('{{formatNames notAnArray}}', {
          ...mockContext,
          notAnArray: 'just a string',
        } as unknown as TemplateContext),
        '',
      );
    });

    it('formatNames returns empty string when author has no family/given/literal', () => {
      expectOk(
        service.render('{{formatNames authors}}', {
          ...mockContext,
          authors: [{}],
        } as unknown as TemplateContext),
        '',
      );
    });

    it('formatNames with exactly 1 author', () => {
      expectOk(
        service.render('{{formatNames authors}}', {
          ...mockContext,
          authors: [{ family: 'Doe', given: 'John' }],
        } as unknown as TemplateContext),
        'Doe',
      );
    });

    it('formatNames with 2 authors uses connector', () => {
      expectOk(
        service.render('{{formatNames authors}}', {
          ...mockContext,
          authors: [{ family: 'Doe' }, { family: 'Smith' }],
        } as unknown as TemplateContext),
        'Doe and Smith',
      );
    });

    it('formatNames with max=3 and 4 authors shows first + et al.', () => {
      expectOk(
        service.render('{{formatNames authors max=3}}', {
          ...mockContext,
          authors: [
            { family: 'Doe' },
            { family: 'Smith' },
            { family: 'Jones' },
            { family: 'Brown' },
          ],
        } as unknown as TemplateContext),
        'Doe et al.',
      );
    });

    it('formatNames with max=3 and exactly 3 authors lists all', () => {
      expectOk(
        service.render('{{formatNames authors max=3}}', {
          ...mockContext,
          authors: [
            { family: 'Doe' },
            { family: 'Smith' },
            { family: 'Jones' },
          ],
        } as unknown as TemplateContext),
        'Doe, Smith and Jones',
      );
    });

    it('formatNames uses literal name when family/given are absent', () => {
      expectOk(
        service.render('{{formatNames authors}}', {
          ...mockContext,
          authors: [{ literal: 'UNESCO' }],
        } as unknown as TemplateContext),
        'UNESCO',
      );
    });

    it('formatNames returns empty string for empty array', () => {
      expectOk(
        service.render('{{formatNames authors}}', {
          ...mockContext,
          authors: [],
        } as unknown as TemplateContext),
        '',
      );
    });

    it('join returns original value when input is not an array', () => {
      expectOk(
        service.render('{{join notArray ", "}}', {
          ...mockContext,
          notArray: 'hello',
        } as unknown as TemplateContext),
        'hello',
      );
    });

    it('join works with array values', () => {
      expectOk(
        service.render('{{join items ", "}}', {
          ...mockContext,
          items: ['a', 'b', 'c'],
        } as unknown as TemplateContext),
        'a, b, c',
      );
    });

    it('split returns original value when input is not a string', () => {
      expectOk(
        service.render('{{split notString ", "}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });
  });

  describe('Path Helpers — branch coverage', () => {
    it('urlEncode returns original value when input is not a string', () => {
      expectOk(
        service.render('{{urlEncode notString}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });

    it('basename returns original value when input is not a string', () => {
      expectOk(
        service.render('{{basename notString}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });

    it('filename returns original value when input is not a string', () => {
      expectOk(
        service.render('{{filename notString}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });

    it('dirname returns original value when input is not a string', () => {
      expectOk(
        service.render('{{dirname notString}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });

    it('basename with backslash paths (Windows)', () => {
      expectOk(
        service.render('{{basename "C:\\path\\to\\file.txt"}}', mockContext),
        'file.txt',
      );
    });

    it('filename with backslash paths (Windows)', () => {
      expectOk(
        service.render('{{filename "C:\\path\\to\\file.txt"}}', mockContext),
        'file',
      );
    });

    it('dirname with backslash paths (Windows)', () => {
      expectOk(
        service.render('{{dirname "C:\\path\\to\\file.txt"}}', mockContext),
        'C:\\path\\to',
      );
    });
  });

  describe('PDF Link Helpers', () => {
    it('pdfLink returns file:// URI for the first PDF', () => {
      expectOk(
        service.render('{{pdfLink files}}', {
          ...mockContext,
          files: ['/home/user/papers/smith2023.pdf'],
        } as unknown as TemplateContext),
        'file:///home/user/papers/smith2023.pdf',
      );
    });

    it('pdfLink returns empty string when no PDFs in file list', () => {
      expectOk(
        service.render('{{pdfLink files}}', {
          ...mockContext,
          files: ['/home/user/notes.txt'],
        } as unknown as TemplateContext),
        '',
      );
    });

    it('pdfLink returns empty string when files is not an array', () => {
      expectOk(
        service.render('{{pdfLink files}}', {
          ...mockContext,
          files: null,
        } as unknown as TemplateContext),
        '',
      );
    });

    it('pdfLink picks the first PDF when multiple exist', () => {
      expectOk(
        service.render('{{pdfLink files}}', {
          ...mockContext,
          files: ['/notes.txt', '/first.pdf', '/second.pdf'],
        } as unknown as TemplateContext),
        'file:///first.pdf',
      );
    });

    it('pdfLink URL-encodes spaces in paths', () => {
      expectOk(
        service.render('{{pdfLink files}}', {
          ...mockContext,
          files: ['/home/user/My Library/Smith 2023.pdf'],
        } as unknown as TemplateContext),
        'file:///home/user/My%20Library/Smith%202023.pdf',
      );
    });

    it('pdfMarkdownLink returns Markdown link for the first PDF', () => {
      expectOk(
        service.render('{{pdfMarkdownLink files}}', {
          ...mockContext,
          files: ['/papers/smith2023.pdf'],
        } as unknown as TemplateContext),
        '[smith2023](file:///papers/smith2023.pdf)',
      );
    });

    it('pdfMarkdownLink returns empty string when no PDFs', () => {
      expectOk(
        service.render('{{pdfMarkdownLink files}}', {
          ...mockContext,
          files: [],
        } as unknown as TemplateContext),
        '',
      );
    });
  });

  describe('String Helpers — branch coverage', () => {
    it('replace returns original value when input is not a string', () => {
      expectOk(
        service.render('{{replace notString "a" "b"}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });

    it('replace returns original value and warns on invalid regex', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      expectOk(
        service.render('{{replace "hello" "[invalid" "x"}}', mockContext),
        'hello',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid regex pattern'),
      );
      warnSpy.mockRestore();
    });

    it('truncate returns original value when input is not a string', () => {
      expectOk(
        service.render('{{truncate notString 5}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '42',
      );
    });

    it('truncate returns original string when shorter than limit', () => {
      expectOk(service.render('{{truncate "hi" 10}}', mockContext), 'hi');
    });

    it('match returns empty string when input is not a string', () => {
      expectOk(
        service.render('{{match notString "\\w+"}}', {
          ...mockContext,
          notString: 42,
        } as unknown as TemplateContext),
        '',
      );
    });

    it('match returns empty string and warns on invalid regex', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      expectOk(service.render('{{match "hello" "[invalid"}}', mockContext), '');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid regex pattern'),
      );
      warnSpy.mockRestore();
    });

    it('match returns empty string when no match found', () => {
      expectOk(service.render('{{match "hello" "xyz"}}', mockContext), '');
    });
  });

  describe('Date Helpers', () => {
    describe('formatDate utility', () => {
      const fixedDate = new Date(2024, 0, 15, 9, 5, 3); // 2024-01-15 09:05:03

      it('should format YYYY-MM-DD', () => {
        expect(formatDate(fixedDate, 'YYYY-MM-DD')).toBe('2024-01-15');
      });

      it('should format DD.MM.YYYY', () => {
        expect(formatDate(fixedDate, 'DD.MM.YYYY')).toBe('15.01.2024');
      });

      it('should format YYYY/MM/DD', () => {
        expect(formatDate(fixedDate, 'YYYY/MM/DD')).toBe('2024/01/15');
      });

      it('should format with time tokens HH:mm:ss', () => {
        expect(formatDate(fixedDate, 'YYYY-MM-DD HH:mm:ss')).toBe(
          '2024-01-15 09:05:03',
        );
      });

      it('should handle single-digit month and day with zero padding', () => {
        const date = new Date(2024, 0, 5); // January 5
        expect(formatDate(date, 'MM-DD')).toBe('01-05');
      });

      it('should handle December (month 12)', () => {
        const date = new Date(2024, 11, 31); // December 31
        expect(formatDate(date, 'YYYY-MM-DD')).toBe('2024-12-31');
      });

      it('should preserve literal text around tokens', () => {
        expect(formatDate(fixedDate, 'Date: YYYY-MM-DD end')).toBe(
          'Date: 2024-01-15 end',
        );
      });
    });

    describe('currentDate helper', () => {
      it('should render current date in default YYYY-MM-DD format', () => {
        const now = new Date();
        const expected = [
          String(now.getFullYear()),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
        ].join('-');

        const result = service.render('{{currentDate}}', mockContext);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe(expected);
      });

      it('should accept a custom format via hash parameter', () => {
        const now = new Date();
        const expected = [
          String(now.getDate()).padStart(2, '0'),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getFullYear()),
        ].join('.');

        const result = service.render(
          '{{currentDate format="DD.MM.YYYY"}}',
          mockContext,
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe(expected);
      });

      it('should render inline with surrounding text', () => {
        const result = service.render(
          'Created on: {{currentDate}}',
          mockContext,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
          // Verify the output matches the pattern "Created on: YYYY-MM-DD"
          expect(result.value).toMatch(/^Created on: \d{4}-\d{2}-\d{2}$/);
        }
      });

      it('should work with YYYY/MM/DD format', () => {
        const now = new Date();
        const expected = [
          String(now.getFullYear()),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
        ].join('/');

        const result = service.render(
          '{{currentDate format="YYYY/MM/DD"}}',
          mockContext,
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe(expected);
      });
    });
  });
});
