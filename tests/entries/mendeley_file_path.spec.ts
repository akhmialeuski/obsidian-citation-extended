/**
 * Tests for Mendeley file path normalization (GitHub issue #175).
 *
 * Mendeley stores file paths in non-standard format:
 *   :C\:\\Project/Literature/MyPDF.pdf:PDF
 * Instead of standard:
 *   C:\\Project\\Literature\\MyPDF.pdf
 */
import { EntryBibLaTeXAdapter } from '../../src/core';
import { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';

function makeEntryWithFile(fileValue: string): EntryBibLaTeXAdapter {
  const data = {
    key: 'test_entry',
    type: 'article',
    creators: {},
    fields: {
      title: ['Test'],
      file: [fileValue],
    },
  } as unknown as EntryDataBibLaTeX;
  return new EntryBibLaTeXAdapter(data);
}

describe('Mendeley file path normalization (#175)', () => {
  it('normalizes Mendeley Windows-style path', () => {
    const entry = makeEntryWithFile(
      ':C\\:\\\\Project/Literature/MyPDF.pdf:PDF',
    );
    expect(entry.files[0]).toBe('C:/Project/Literature/MyPDF.pdf');
  });

  it('preserves standard file path', () => {
    const entry = makeEntryWithFile('C:/Users/user/Documents/paper.pdf');
    expect(entry.files[0]).toBe('C:/Users/user/Documents/paper.pdf');
  });

  it('strips trailing :PDF from standard path', () => {
    const entry = makeEntryWithFile('C:\\Project\\Literature\\MyPDF.pdf:PDF');
    expect(entry.files[0]).toContain('MyPDF.pdf');
    expect(entry.files[0]).not.toContain(':PDF');
  });

  it('handles unix-style paths', () => {
    const entry = makeEntryWithFile('/Users/user/library/paper.pdf');
    expect(entry.files[0]).toBe('/Users/user/library/paper.pdf');
  });

  it('handles multiple files separated by semicolon', () => {
    const data = {
      key: 'multi_file',
      type: 'article',
      creators: {},
      fields: {
        title: ['Test'],
        file: [':C\\:\\\\a.pdf:PDF;:C\\:\\\\b.pdf:PDF'],
      },
    } as unknown as EntryDataBibLaTeX;
    const entry = new EntryBibLaTeXAdapter(data);
    expect(entry.files.length).toBe(2);
    expect(entry.files[0]).toBe('C:/a.pdf');
    expect(entry.files[1]).toBe('C:/b.pdf');
  });

  it('filters out empty file paths', () => {
    const data = {
      key: 'empty_file',
      type: 'article',
      creators: {},
      fields: {
        title: ['Test'],
        file: [';;valid.pdf'],
      },
    } as unknown as EntryDataBibLaTeX;
    const entry = new EntryBibLaTeXAdapter(data);
    expect(entry.files.length).toBe(1);
    expect(entry.files[0]).toBe('valid.pdf');
  });

  it('does not strip colon from filenames like file:v2.pdf', () => {
    const entry = makeEntryWithFile('C:/docs/file:v2.pdf');
    // :v2.pdf contains a dot, so :[A-Za-z]+$ won't match
    expect(entry.files[0]).toBe('C:/docs/file:v2.pdf');
  });
});
