import {
  CitationService,
  ICitationService,
} from '../../src/application/citation.service';
import { LibraryNotReadyError, EntryNotFoundError } from '../../src/core';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeMocks(overrides: Record<string, unknown> = {}) {
  const library = {
    entries: {
      key1: { id: 'key1', type: 'article', title: 'Test Article' },
    },
  };

  const libraryService = {
    library,
    isLibraryLoading: false,
    ...(overrides.libraryService as Record<string, unknown>),
  };

  const templateService = {
    getTemplateVariables: jest.fn((entry: unknown, extras?: unknown) => ({
      citekey: (entry as { id: string }).id,
      ...((extras as Record<string, unknown>) ?? {}),
    })),
    getTitle: jest.fn(() => ({ ok: true, value: 'Test Title' })),
    render: jest.fn(() => ({ ok: true, value: 'rendered content' })),
    getMarkdownCitation: jest.fn((_vars: unknown, alternative?: boolean) => ({
      ok: true,
      value: alternative ? '@key1' : '[@key1]',
    })),
    ...(overrides.templateService as Record<string, unknown>),
  };

  const contentTemplateResolver = {
    resolve: jest.fn(() => Promise.resolve('template {{citekey}}')),
    ...(overrides.contentTemplateResolver as Record<string, unknown>),
  };

  const settings = {
    literatureNoteTitleTemplate: '@{{citekey}}',
    ...(overrides.settings as Record<string, unknown>),
  };

  return { libraryService, templateService, contentTemplateResolver, settings };
}

function createService(
  overrides: Record<string, unknown> = {},
): ICitationService {
  const mocks = makeMocks(overrides);
  return new CitationService(
    mocks.libraryService as never,
    mocks.templateService as never,
    mocks.contentTemplateResolver as never,
    mocks.settings as never,
  );
}

describe('CitationService', () => {
  describe('getEntry', () => {
    it('returns entry when it exists', () => {
      const service = createService();
      const result = service.getEntry('key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('key1');
      }
    });

    it('returns error when library is loading', () => {
      const service = createService({
        libraryService: { library: null, isLibraryLoading: true },
      });
      const result = service.getEntry('key1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(LibraryNotReadyError);
      }
    });

    it('returns error when library is null', () => {
      const service = createService({
        libraryService: { library: null, isLibraryLoading: false },
      });
      const result = service.getEntry('key1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(LibraryNotReadyError);
      }
    });

    it('returns error when entry not found', () => {
      const service = createService();
      const result = service.getEntry('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(EntryNotFoundError);
      }
    });
  });

  describe('getTitleForCitekey', () => {
    it('renders title through template service', () => {
      const service = createService();
      const result = service.getTitleForCitekey('key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Test Title');
      }
    });

    it('sanitizes disallowed filename characters', () => {
      const mocks = makeMocks();
      mocks.templateService.getTitle = jest.fn(() => ({
        ok: true,
        value: 'Title: with/bad\\chars',
      }));
      const service = new CitationService(
        mocks.libraryService as never,
        mocks.templateService as never,
        mocks.contentTemplateResolver as never,
        mocks.settings as never,
      );
      const result = service.getTitleForCitekey('key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toContain(':');
      }
    });

    it('returns error when entry not found', () => {
      const service = createService();
      const result = service.getTitleForCitekey('nonexistent');
      expect(result.ok).toBe(false);
    });
  });

  describe('getInitialContentForCitekey', () => {
    it('resolves template and renders content', async () => {
      const service = createService();
      const result = await service.getInitialContentForCitekey('key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('rendered content');
      }
    });

    it('passes selectedText to template variables', async () => {
      const mocks = makeMocks();
      const service = new CitationService(
        mocks.libraryService as never,
        mocks.templateService as never,
        mocks.contentTemplateResolver as never,
        mocks.settings as never,
      );
      await service.getInitialContentForCitekey('key1', 'selected text');
      expect(mocks.templateService.getTemplateVariables).toHaveBeenCalledWith(
        expect.anything(),
        { selectedText: 'selected text' },
      );
    });

    it('returns error when entry not found', async () => {
      const service = createService();
      const result = await service.getInitialContentForCitekey('nonexistent');
      expect(result.ok).toBe(false);
    });
  });

  describe('getMarkdownCitation', () => {
    it('returns primary citation', () => {
      const service = createService();
      const result = service.getMarkdownCitation('key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('[@key1]');
      }
    });

    it('returns alternative citation', () => {
      const service = createService();
      const result = service.getMarkdownCitation('key1', true);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('@key1');
      }
    });

    it('passes selectedText to template variables', () => {
      const mocks = makeMocks();
      const service = new CitationService(
        mocks.libraryService as never,
        mocks.templateService as never,
        mocks.contentTemplateResolver as never,
        mocks.settings as never,
      );
      service.getMarkdownCitation('key1', false, 'selected');
      expect(mocks.templateService.getTemplateVariables).toHaveBeenCalledWith(
        expect.anything(),
        { selectedText: 'selected' },
      );
    });

    it('returns error when entry not found', () => {
      const service = createService();
      const result = service.getMarkdownCitation('nonexistent');
      expect(result.ok).toBe(false);
    });
  });
});
