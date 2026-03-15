/**
 * Tests for special character handling in entries (GitHub issue #119).
 *
 * Verifies that entries with Unicode characters (γ, á, é, etc.)
 * in titles and author names are correctly parsed and searchable.
 */
import { loadEntries, EntryBibLaTeXAdapter, EntryDataBibLaTeX } from '../types';
import { SearchService } from '../search/search.service';

describe('Special characters in entries (#119)', () => {
  const unicodeBib = `
@article{Turinetto2012,
  title = {High {{Basal γH2AX Levels Sustain Self}}-{{Renewal}} of {{Mouse Embryonic}} and {{Induced Pluripotent Stem Cells}}},
  author = {Turinetto, Valentina and Orlando, Luca},
  date = {2012-07-01},
  journaltitle = {Stem Cells},
  volume = {30},
  number = {7},
  pages = {1414--1423},
}

@article{Sanchez2020,
  title = {Análisis de la résistance à l'érosion},
  author = {Sánchez-Ripoll, Yolanda and Müller, Hans},
  year = {2020},
  journal = {Revue Française},
}
`;

  it('parses entries with Unicode characters in title', () => {
    const result = loadEntries(unicodeBib, 'biblatex');
    expect(result.entries.length).toBe(2);
    expect(result.parseErrors.length).toBe(0);
  });

  it('preserves Unicode γ in title', () => {
    const result = loadEntries(unicodeBib, 'biblatex');
    const entry = new EntryBibLaTeXAdapter(
      result.entries[0] as EntryDataBibLaTeX,
    );
    expect(entry.title).toContain('γH2AX');
  });

  it('preserves accented characters in title and author', () => {
    const result = loadEntries(unicodeBib, 'biblatex');
    const entry = new EntryBibLaTeXAdapter(
      result.entries[1] as EntryDataBibLaTeX,
    );
    expect(entry.title).toContain('Análisis');
    expect(entry.authorString).toContain('Sánchez-Ripoll');
    expect(entry.authorString).toContain('Müller');
  });

  it('entries with Unicode are found by search', () => {
    const result = loadEntries(unicodeBib, 'biblatex');
    const entries = result.entries.map(
      (e) => new EntryBibLaTeXAdapter(e as EntryDataBibLaTeX),
    );

    const searchService = new SearchService();
    searchService.buildIndex(entries);

    // Search by citekey
    const byKey = searchService.search('Turinetto2012');
    expect(byKey).toContain('Turinetto2012');

    // Search by title fragment
    const byTitle = searchService.search('Renewal Mouse');
    expect(byTitle).toContain('Turinetto2012');
  });
});
