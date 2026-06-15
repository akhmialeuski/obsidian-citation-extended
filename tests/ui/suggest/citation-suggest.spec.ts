/* eslint-disable @typescript-eslint/no-explicit-any -- tests use minimal structural mocks cast to the suggester's interfaces */
jest.mock(
  'obsidian',
  () => ({
    EditorSuggest: class {
      app: unknown;
      context: unknown = null;
      constructor(app: unknown) {
        this.app = app;
      }
    },
  }),
  { virtual: true },
);

import { CitationEditorSuggest } from '../../../src/ui/suggest/citation-suggest';
import { createMockEntry } from '../../helpers/mock-obsidian';

interface MockEditor {
  getLine: (line: number) => string;
  replaceRange: jest.Mock;
  setCursor: jest.Mock;
}

function makeEditor(line: string): MockEditor {
  return {
    getLine: () => line,
    replaceRange: jest.fn(),
    setCursor: jest.fn(),
  };
}

function makeSuggest(opts: {
  enabled?: boolean;
  hasLibrary?: boolean;
  searchIds?: string[];
  citation?: { ok: boolean; value?: string };
}) {
  const entry = createMockEntry({ id: 'smith2023' });
  const library = { entries: { smith2023: entry } };

  const deps = {
    libraryService: {
      library: opts.hasLibrary === false ? null : library,
      searchService: {
        search: jest.fn(() => opts.searchIds ?? ['smith2023']),
      },
      getSortedEntries: jest.fn(() => [entry]),
    },
    citationService: {
      getMarkdownCitation: jest.fn(
        () => opts.citation ?? { ok: true, value: '[@smith2023]' },
      ),
    },
    settings: {
      enableInlineSuggestions: opts.enabled ?? true,
      referenceListSortOrder: 'default',
    },
  };

  const suggest = new CitationEditorSuggest({} as any, deps as any);
  return { suggest, deps, entry };
}

describe('CitationEditorSuggest.onTrigger', () => {
  it('returns null when inline suggestions are disabled', () => {
    const { suggest } = makeSuggest({ enabled: false });
    const editor = makeEditor('see @smi');
    expect(
      suggest.onTrigger({ line: 0, ch: 8 }, editor as any, null),
    ).toBeNull();
  });

  it('returns null when the library is not loaded', () => {
    const { suggest } = makeSuggest({ hasLibrary: false });
    const editor = makeEditor('see @smi');
    expect(
      suggest.onTrigger({ line: 0, ch: 8 }, editor as any, null),
    ).toBeNull();
  });

  it('triggers on a bare @ and reports the query and start column', () => {
    const { suggest } = makeSuggest({});
    const editor = makeEditor('see @smi');
    const info = suggest.onTrigger({ line: 0, ch: 8 }, editor as any, null);
    expect(info).not.toBeNull();
    expect(info!.query).toBe('smi');
    // Start sits on the '@' (column 4).
    expect(info!.start).toEqual({ line: 0, ch: 4 });
    expect(info!.end).toEqual({ line: 0, ch: 8 });
  });

  it('includes a leading bracket in the replaced range', () => {
    const { suggest } = makeSuggest({});
    const editor = makeEditor('text [@smi');
    const info = suggest.onTrigger({ line: 0, ch: 10 }, editor as any, null);
    expect(info!.query).toBe('smi');
    // Start sits on the '[' (column 5) so a `[@key]` template won't double it.
    expect(info!.start).toEqual({ line: 0, ch: 5 });
  });

  it('does not trigger inside an e-mail address', () => {
    const { suggest } = makeSuggest({});
    const editor = makeEditor('mail john@example');
    expect(
      suggest.onTrigger({ line: 0, ch: 17 }, editor as any, null),
    ).toBeNull();
  });
});

describe('CitationEditorSuggest.getSuggestions', () => {
  it('returns sorted entries for an empty query', () => {
    const { suggest, deps } = makeSuggest({});
    const result = suggest.getSuggestions({ query: '' } as any);
    expect(deps.libraryService.getSortedEntries).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('maps search ids back to entries for a non-empty query', () => {
    const { suggest, deps } = makeSuggest({ searchIds: ['smith2023'] });
    const result = suggest.getSuggestions({ query: 'smi' } as any);
    expect(deps.libraryService.searchService.search).toHaveBeenCalledWith(
      'smi',
      expect.any(Number),
    );
    expect(result[0].id).toBe('smith2023');
  });
});

describe('CitationEditorSuggest.selectSuggestion', () => {
  it('replaces the trigger range with the rendered citation', () => {
    const { suggest, entry } = makeSuggest({});
    const editor = makeEditor('see @smi');
    suggest.context = {
      editor,
      start: { line: 0, ch: 4 },
      end: { line: 0, ch: 8 },
      query: 'smi',
    } as any;

    suggest.selectSuggestion(entry, { shiftKey: false } as KeyboardEvent);

    expect(editor.replaceRange).toHaveBeenCalledWith(
      '[@smith2023]',
      { line: 0, ch: 4 },
      { line: 0, ch: 8 },
    );
    // Cursor lands at the end of the inserted citation.
    expect(editor.setCursor).toHaveBeenCalledWith({
      line: 0,
      ch: 4 + '[@smith2023]'.length,
    });
  });

  it('uses the alternative format when Shift is held', () => {
    const { suggest, deps, entry } = makeSuggest({});
    const editor = makeEditor('see @smi');
    suggest.context = {
      editor,
      start: { line: 0, ch: 4 },
      end: { line: 0, ch: 8 },
      query: 'smi',
    } as any;

    suggest.selectSuggestion(entry, { shiftKey: true } as KeyboardEvent);

    expect(deps.citationService.getMarkdownCitation).toHaveBeenCalledWith(
      'smith2023',
      true,
    );
  });
});
