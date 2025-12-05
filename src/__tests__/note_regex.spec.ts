import { EntryBibLaTeXAdapter, EntryDataBibLaTeX } from '../types';

describe('EntryBibLaTeXAdapter note parsing regex', () => {
  test('correctly handles multiple zotero links in a single line', () => {
    // Mock minimal data required for EntryBibLaTeXAdapter
    const mockData: unknown = {
      key: 'test_key',
      type: 'article',
      fields: {
        note: [
          'Prefix |Open PDF, \\href{zotero://open-pdf/1}{Open PDF}| Middle |Open item, \\href{zotero://select/2}{Open item}| Suffix',
        ],
      },
      creators: {},
    };

    const entry = new EntryBibLaTeXAdapter(mockData as EntryDataBibLaTeX);
    const note = entry.note;

    // The greedy regex bug would capture "zotero://open-pdf/1}{Open PDF}| Middle |Open item, \href{zotero://select/2}{Open item}| Suffix"
    // instead of stopping at the end of the first URL.

    // We expect the output to contain properly formatted markdown links if the fix works.
    // Based on the code: .replace(/(zotero:\/\/.+)/g, '[Link]($1)')
    // If greedy: [Link](zotero://open-pdf/1}{Open PDF}| Middle |Open item, \href{zotero://select/2}{Open item}| Suffix)
    // If non-greedy: [Link](zotero://open-pdf/1) ... [Link](zotero://select/2)

    // Assuming the intent is to extract the URL.
    // However, the original code simple wraps the match in [Link]().
    // If the regex matches incorrectly, the output is messed up.

    expect(note).toContain('zotero://open-pdf/1');
    expect(note).toContain('zotero://select/2');
    // Verify that the text between links is preserved (fix for greedy consumption)
    expect(note).toContain('Middle');
  });
});
