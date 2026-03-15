import {
  CitationError,
  LibraryNotReadyError,
  EntryNotFoundError,
  TemplateRenderError,
  DataSourceError,
} from '../errors';

describe('Domain errors', () => {
  describe('CitationError', () => {
    it('should set message and code', () => {
      const error = new CitationError('something failed', 'GENERIC');
      expect(error.message).toBe('something failed');
      expect(error.code).toBe('GENERIC');
      expect(error.name).toBe('CitationError');
    });

    it('should be instanceof Error', () => {
      const error = new CitationError('test', 'TEST');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CitationError);
    });
  });

  describe('LibraryNotReadyError', () => {
    it('should have default message and LIBRARY_NOT_READY code', () => {
      const error = new LibraryNotReadyError();
      expect(error.code).toBe('LIBRARY_NOT_READY');
      expect(error.message).toContain('loading');
      expect(error.name).toBe('LibraryNotReadyError');
    });

    it('should accept custom message', () => {
      const error = new LibraryNotReadyError('custom msg');
      expect(error.message).toBe('custom msg');
    });

    it('should be instanceof CitationError and Error', () => {
      const error = new LibraryNotReadyError();
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CitationError);
      expect(error).toBeInstanceOf(LibraryNotReadyError);
    });
  });

  describe('EntryNotFoundError', () => {
    it('should include citekey in message', () => {
      const error = new EntryNotFoundError('smith2023');
      expect(error.citekey).toBe('smith2023');
      expect(error.message).toContain('smith2023');
      expect(error.code).toBe('ENTRY_NOT_FOUND');
      expect(error.name).toBe('EntryNotFoundError');
    });

    it('should be instanceof CitationError', () => {
      const error = new EntryNotFoundError('key');
      expect(error).toBeInstanceOf(CitationError);
      expect(error).toBeInstanceOf(EntryNotFoundError);
    });
  });

  describe('TemplateRenderError', () => {
    it('should set message and optional templateName', () => {
      const error = new TemplateRenderError('bad template', 'titleTemplate');
      expect(error.message).toBe('bad template');
      expect(error.templateName).toBe('titleTemplate');
      expect(error.code).toBe('TEMPLATE_RENDER_ERROR');
    });

    it('should work without templateName', () => {
      const error = new TemplateRenderError('parse error');
      expect(error.templateName).toBeUndefined();
    });

    it('should be instanceof CitationError', () => {
      const error = new TemplateRenderError('err');
      expect(error).toBeInstanceOf(CitationError);
      expect(error).toBeInstanceOf(TemplateRenderError);
    });
  });

  describe('DataSourceError', () => {
    it('should set message and optional sourceId', () => {
      const error = new DataSourceError('load failed', 'source-0');
      expect(error.message).toBe('load failed');
      expect(error.sourceId).toBe('source-0');
      expect(error.code).toBe('DATA_SOURCE_ERROR');
    });

    it('should be instanceof CitationError', () => {
      const error = new DataSourceError('err');
      expect(error).toBeInstanceOf(CitationError);
      expect(error).toBeInstanceOf(DataSourceError);
    });
  });

  describe('prototype chain (ES5 compatibility)', () => {
    it('should support instanceof checks for all error subclasses', () => {
      const errors = [
        new LibraryNotReadyError(),
        new EntryNotFoundError('key'),
        new TemplateRenderError('err'),
        new DataSourceError('err'),
      ];

      for (const error of errors) {
        expect(error instanceof Error).toBe(true);
        expect(error instanceof CitationError).toBe(true);
      }
    });
  });
});
