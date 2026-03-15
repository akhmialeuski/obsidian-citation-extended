/**
 * Tests for HTML entity decoding in note field (GitHub issue #150).
 *
 * bibtex-parser produces several encodings:
 *   \textless / \textgreater  →  &lt; / &gt;
 *   &lt; / &gt; in input      →  &amp;lt; / &amp;gt; (double-encoded)
 *   plain < / > in braces     →  ¡ / ¿  (inverted punctuation)
 *   \href{url}{text}          →  <a href="url">text</a>
 */
import { loadEntries, EntryBibLaTeXAdapter, EntryDataBibLaTeX } from '../types';

function makeEntry(noteValue: string): EntryBibLaTeXAdapter {
  const bib = `
@article{test_entry,
  title = {Test},
  author = {Doe, John},
  year = {2023},
  note = {${noteValue}},
}
`;
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const result = loadEntries(bib, 'biblatex');
  warnSpy.mockRestore();
  return new EntryBibLaTeXAdapter(result.entries[0] as EntryDataBibLaTeX);
}

describe('HTML entity decoding in note field (#150)', () => {
  it('decodes ¡ and ¿ (parser conversion of plain < >) back to < and >', () => {
    // bibtex-parser converts plain < > to ¡ ¿
    const entry = makeEntry('5 < x > 3');
    expect(entry.note).toBe('5 < x > 3');
  });

  it('decodes &lt; and &gt; from \\textless/\\textgreater', () => {
    // bibtex-parser converts \textless to &lt;
    const entry = makeEntry('ratio \\textless 0.5 or \\textgreater 1.0');
    expect(entry.note).toBe('ratio <0.5 or >1.0');
  });

  it('preserves note content without entities unchanged', () => {
    const entry = makeEntry('Just a plain note with no entities');
    expect(entry.note).toBe('Just a plain note with no entities');
  });

  it('converts ¡a href¿ anchor tags to Markdown links', () => {
    // bibtex-parser converts raw <a href> to ¡a href¿
    const entry = makeEntry(
      'See <a href="https://example.com">Example</a> for details',
    );
    expect(entry.note).toContain('[Example](https://example.com)');
  });

  it('converts \\href to Markdown links (existing behavior)', () => {
    const bib = `
@misc{href_test,
  title = {Test},
  note = {text (\\href{zotero://open-pdf/items/ABC}{Smith 2020:1})}
}
`;
    const result = loadEntries(bib, 'biblatex');
    const entry = new EntryBibLaTeXAdapter(
      result.entries[0] as EntryDataBibLaTeX,
    );
    expect(entry.note).toContain('[Smith 2020:1](zotero://open-pdf/items/ABC)');
  });
});
