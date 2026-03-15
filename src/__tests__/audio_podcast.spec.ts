/**
 * Tests for @audio / podcast entry type support (GitHub issue #246).
 *
 * Verifies that @audio entries with entrysubtype=podcastepisode are
 * correctly parsed and available for search.
 */
import { loadEntries, EntryBibLaTeXAdapter, EntryDataBibLaTeX } from '../core';

describe('@audio / podcast entry type (#246)', () => {
  const podcastBib = `
@audio{Hesse2023,
  title = {HR IT Transformation mit EY},
  author = {Hesse, Gero},
  date = {2023-06-09},
  number = {292},
  url = {https://example.com/podcast},
  langid = {ngerman},
  entrysubtype = {podcastepisode},
  maintitle = {Saatkorn Podcast},
}
`;

  it('parses @audio entry type', () => {
    const result = loadEntries(podcastBib, 'biblatex');
    expect(result.entries.length).toBe(1);
    expect(result.parseErrors.length).toBe(0);
  });

  it('creates valid adapter from @audio entry', () => {
    const result = loadEntries(podcastBib, 'biblatex');
    const entry = new EntryBibLaTeXAdapter(
      result.entries[0] as EntryDataBibLaTeX,
    );

    expect(entry.id).toBe('Hesse2023');
    expect(entry.type).toBe('audio');
    expect(entry.title).toBe('HR IT Transformation mit EY');
    expect(entry.authorString).toBe('Gero Hesse');
    expect(entry.URL).toBe('https://example.com/podcast');
  });

  it('works alongside standard entry types', () => {
    const mixedBib = `
@article{article1,
  title = {Regular Article},
  author = {Smith, John},
  year = {2023},
  journal = {Test Journal},
}
${podcastBib}
@book{book1,
  title = {Regular Book},
  author = {Doe, Jane},
  year = {2022},
}
`;
    const result = loadEntries(mixedBib, 'biblatex');
    expect(result.entries.length).toBe(3);

    const types = result.entries.map((e) => (e as EntryDataBibLaTeX).type);
    expect(types).toContain('audio');
    expect(types).toContain('article');
    expect(types).toContain('book');
  });
});
