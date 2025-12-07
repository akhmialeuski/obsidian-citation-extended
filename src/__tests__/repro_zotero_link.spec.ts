import { loadEntries, EntryBibLaTeXAdapter, EntryDataBibLaTeX } from '../types';

describe('Zotero Link Reproduction', () => {
  const bibtexLibrary = `
@misc{zotero_link_test,
  title = {Test Title},
  note = {These work environments are often characterised by significant trade-offs in terms of relationship quality, productivity and well-being (\\href{zotero://open-pdf/library/items/RTDDFWMC?page=1}{Morrison 2020:366})}
}
`;

  it('should preserve the link text in the note field', () => {
    const entries = loadEntries(bibtexLibrary, 'biblatex');
    const entry = new EntryBibLaTeXAdapter(
      entries[0] as unknown as EntryDataBibLaTeX,
    );

    // We expect the text "Morrison 2020:366" to be preserved in the link
    // Currently, it is expected to fail and produce "[Link](zotero://...)"
    expect(entry.note).toContain(
      '[Morrison 2020:366](zotero://open-pdf/library/items/RTDDFWMC?page=1)',
    );
  });
});
