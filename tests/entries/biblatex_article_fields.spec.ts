/**
 * Tests for @article entries with BibLaTeX-style fields (GitHub issue #60).
 *
 * Verifies that @article entries using `journaltitle` instead of `journal`
 * and `date` instead of `year` are correctly parsed, produce valid
 * adapter fields, and are discoverable by search.
 */
import {
  loadEntries,
  EntryBibLaTeXAdapter,
  EntryDataBibLaTeX,
} from '../../src/core';
import { SearchService } from '../../src/search/search.service';

describe('@article with BibLaTeX fields (#60)', () => {
  // Exact entry from the issue report
  const biblatexArticle = `
@Article{merton_1938_social-structure-anomie,
  title = {Social Structure and Anomie},
  author = {Merton, Robert K.},
  date = {1938-10},
  journaltitle = {American Sociological Review},
  volume = {3},
  number = {5},
  pages = {672},
  doi = {10.2307/2084686},
}
`;

  let entry: EntryBibLaTeXAdapter;

  beforeAll(() => {
    const result = loadEntries(biblatexArticle, 'biblatex');
    expect(result.entries).toHaveLength(1);
    expect(result.parseErrors).toHaveLength(0);
    entry = new EntryBibLaTeXAdapter(result.entries[0] as EntryDataBibLaTeX);
  });

  it('parses the entry without errors', () => {
    const result = loadEntries(biblatexArticle, 'biblatex');
    expect(result.entries).toHaveLength(1);
    expect(result.parseErrors).toHaveLength(0);
  });

  it('preserves citekey with hyphens', () => {
    expect(entry.citekey).toBe('merton_1938_social-structure-anomie');
  });

  it('sets type to article', () => {
    expect(entry.type).toBe('article');
  });

  it('resolves containerTitle from journaltitle', () => {
    expect(entry.containerTitle).toBe('American Sociological Review');
  });

  it('derives year from date field', () => {
    expect(entry.year).toBe(1938);
  });

  it('produces valid issuedDate from partial date', () => {
    expect(entry.issuedDate).toBeInstanceOf(Date);
    expect(entry.issuedDate!.getUTCFullYear()).toBe(1938);
    expect(entry.issuedDate!.getUTCMonth()).toBe(9); // October = 9
  });

  it('maps remaining fields correctly', () => {
    expect(entry.title).toBe('Social structure and anomie');
    expect(entry.authorString).toBe('Robert K. Merton');
    expect(entry.volume).toBe('3');
    expect(entry.page).toBe('672');
    expect(entry.DOI).toBe('10.2307/2084686');
  });

  it('is discoverable by search', () => {
    const searchService = new SearchService();
    searchService.buildIndex([entry]);

    const byCitekey = searchService.search(
      'merton_1938_social-structure-anomie',
    );
    expect(byCitekey).toContain('merton_1938_social-structure-anomie');

    const byAuthor = searchService.search('Merton');
    expect(byAuthor).toContain('merton_1938_social-structure-anomie');
  });

  it('produces complete template context', () => {
    const ctx = entry.toTemplateContext();
    expect(ctx.year).toBe('1938');
    expect(ctx.containerTitle).toBe('American Sociological Review');
    expect(ctx.date).toBe('1938-10-01');
    expect(ctx.citekey).toBe('merton_1938_social-structure-anomie');
  });

  it('handles @article and @book identically with BibLaTeX fields', () => {
    const bookVariant = biblatexArticle.replace('@Article', '@Book');
    const articleResult = loadEntries(biblatexArticle, 'biblatex');
    const bookResult = loadEntries(bookVariant, 'biblatex');

    const articleEntry = new EntryBibLaTeXAdapter(
      articleResult.entries[0] as EntryDataBibLaTeX,
    );
    const bookEntry = new EntryBibLaTeXAdapter(
      bookResult.entries[0] as EntryDataBibLaTeX,
    );

    expect(articleEntry.containerTitle).toBe(bookEntry.containerTitle);
    expect(articleEntry.year).toBe(bookEntry.year);
    expect(articleEntry.authorString).toBe(bookEntry.authorString);
  });
});
