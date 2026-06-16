/**
 * Tests for Zotero tags (keywords) and collections surfaced as template
 * variables (community requests for collection/tag access in templates).
 */
import {
  loadEntries,
  EntryBibLaTeXAdapter,
  EntryDataBibLaTeX,
} from '../../src/core';

function adapt(bib: string): EntryBibLaTeXAdapter {
  const result = loadEntries(bib, 'biblatex');
  expect(result.entries).toHaveLength(1);
  return new EntryBibLaTeXAdapter(result.entries[0] as EntryDataBibLaTeX);
}

describe('BibLaTeX tags and collections', () => {
  const withCollections = `
@article{smith2023,
  title = {A Study},
  author = {Smith, Jane},
  date = {2023},
  keywords = {sociology, methods},
  collections = {Dissertation, Reading group},
}
`;

  it('exposes keywords as the tags alias', () => {
    const entry = adapt(withCollections);
    expect(entry.tags).toEqual(['sociology', 'methods']);
    expect(entry.tags).toEqual(entry.keywords);
  });

  it('parses a comma-separated collections field into a list', () => {
    const entry = adapt(withCollections);
    expect(entry.collections).toEqual(['Dissertation', 'Reading group']);
  });

  it('leaves collections undefined when the field is absent', () => {
    const entry = adapt(`
@article{nocol2023,
  title = {No Collections},
  author = {Doe, John},
  date = {2023},
}
`);
    expect(entry.collections).toBeUndefined();
  });

  it('surfaces tags and collections in the template context', () => {
    const entry = adapt(withCollections);
    const ctx = entry.toTemplateContext();
    expect(ctx.tags).toEqual(['sociology', 'methods']);
    expect(ctx.collections).toEqual(['Dissertation', 'Reading group']);
  });
});
