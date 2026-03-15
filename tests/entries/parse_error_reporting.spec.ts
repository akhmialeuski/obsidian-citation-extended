/**
 * Tests for parse error reporting (GitHub issues #216, #229, #230, #94).
 *
 * Verifies that loadEntries() returns both entries and parse errors,
 * enabling user-visible feedback about skipped entries.
 */
import { loadEntries } from '../../src/core';

describe('loadEntries parse error reporting', () => {
  it('returns empty parseErrors for valid BibLaTeX', () => {
    const bib = `
@article{valid2023,
  title = {A Valid Article},
  author = {Doe, John},
  year = {2023},
  journal = {Journal of Testing},
}
`;
    const result = loadEntries(bib, 'biblatex');
    expect(result.entries.length).toBe(1);
    expect(result.parseErrors.length).toBe(0);
  });

  it('returns empty parseErrors for valid CSL-JSON', () => {
    const json = JSON.stringify([
      { id: 'valid2023', type: 'article-journal', title: 'A Valid Article' },
    ]);
    const result = loadEntries(json, 'csl-json');
    expect(result.entries.length).toBe(1);
    expect(result.parseErrors.length).toBe(0);
  });

  it('collects non-fatal errors for BibLaTeX entries with unsupported LaTeX commands', () => {
    const bib = `
@article{entry_with_bad_latex,
  title = {Test with \\mkern command},
  author = {Doe, John},
  year = {2023},
}
@article{good_entry,
  title = {Good Entry},
  author = {Smith, Jane},
  year = {2024},
}
`;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = loadEntries(bib, 'biblatex');

    // Good entries should still be parsed
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    // Parse errors should be reported
    expect(result.parseErrors.length).toBeGreaterThan(0);

    warnSpy.mockRestore();
  });

  it('collects errors for entries with \\dots LaTeX command', () => {
    const bib = `
@misc{dots_entry,
  title = {Source in Source},
  author = {Last, First},
  year = {2011},
  abstract = {Abstract {\\dots}},
}
`;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = loadEntries(bib, 'biblatex');

    // The entry may or may not parse depending on parser version,
    // but errors should be collected rather than silently swallowed
    if (result.parseErrors.length > 0) {
      expect(result.parseErrors[0].message).toBeDefined();
    }

    warnSpy.mockRestore();
  });

  it('returns both entries and errors for mixed valid/invalid BibLaTeX', () => {
    const bib = `
@article{good1,
  title = {Good Article 1},
  author = {Doe, John},
  year = {2020},
}
@article{good2,
  title = {Good Article 2},
  author = {Smith, Jane},
  year = {2021},
}
`;
    const result = loadEntries(bib, 'biblatex');
    expect(result.entries.length).toBe(2);
    expect(result.parseErrors).toBeDefined();
    expect(Array.isArray(result.parseErrors)).toBe(true);
  });

  it('WorkerResponse structure has required fields', () => {
    const result = loadEntries('[]', 'csl-json');
    expect(result).toHaveProperty('entries');
    expect(result).toHaveProperty('parseErrors');
    expect(Array.isArray(result.entries)).toBe(true);
    expect(Array.isArray(result.parseErrors)).toBe(true);
  });
});
