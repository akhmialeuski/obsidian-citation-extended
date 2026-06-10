/**
 * Tests for the supplementary LaTeX-command fallback table in the BibLaTeX
 * parser. Zotero/Better BibTeX exports emit command spellings that the
 * unicode2latex table does not know (\textbraceleft, \dots, \textnumero,
 * \cyrchar\cyryat, ...). Each must map to its Unicode glyph (or be dropped
 * for styling/spacing commands) WITHOUT producing an "Unhandled command"
 * parse error that floods the library-load warnings.
 */
import {
  loadEntries,
  EntryBibLaTeXAdapter,
  EntryDataBibLaTeX,
} from '../../src/core';

function parseSingle(bib: string): {
  entry: EntryBibLaTeXAdapter;
  parseErrors: { message: string }[];
} {
  const result = loadEntries(bib, 'biblatex');
  expect(result.entries.length).toBe(1);
  return {
    entry: new EntryBibLaTeXAdapter(result.entries[0] as EntryDataBibLaTeX),
    parseErrors: result.parseErrors,
  };
}

describe('LaTeX command fallbacks (BibLaTeX parse warnings)', () => {
  it('maps \\textbraceleft/\\textbraceright to braces without errors', () => {
    const { entry, parseErrors } = parseSingle(`
@article{braces2024,
  title = {\\ensuremath\\textbraceleft\\psi\\textbraceright{} ({{2S}}) Suppression},
  year = {2024},
}
`);
    expect(parseErrors).toHaveLength(0);
    expect(entry.title).toContain('{');
    expect(entry.title).toContain('}');
  });

  it('maps text-mode symbol commands to their Unicode glyphs', () => {
    const { entry, parseErrors } = parseSingle(`
@article{symbols2024,
  title = {Symbols},
  abstract = {Dots \\dots{} num \\textnumero{} bar \\texthorizontalbar{} pm \\textpm{} copy \\copyright{} lnot \\textlnot{} surd \\textsurd{} prime x\\prime},
  year = {2024},
}
`);
    expect(parseErrors).toHaveLength(0);
    const abstract = entry.abstract ?? '';
    expect(abstract).toContain('…');
    expect(abstract).toContain('№');
    expect(abstract).toContain('―');
    expect(abstract).toContain('±');
    expect(abstract).toContain('©');
    expect(abstract).toContain('¬');
    expect(abstract).toContain('√');
    expect(abstract).toContain('x′');
  });

  it('maps the archaic \\cyrchar\\cyryat to ѣ', () => {
    const { entry, parseErrors } = parseSingle(`
@book{yat1900,
  title = {\\cyrchar\\CYRYAT\\cyrchar\\cyryat{} in old orthography},
  year = {1900},
}
`);
    expect(parseErrors).toHaveLength(0);
    expect(entry.title).toContain('Ѣѣ');
  });

  it('drops math styling/spacing commands but keeps their argument text', () => {
    const { entry, parseErrors } = parseSingle(`
@article{math2024,
  title = {Math},
  abstract = {Bold \\mathbf{H} field, sfbf \\mathsfbf{X}, kern a\\mkern 2mu b},
  year = {2024},
}
`);
    expect(parseErrors).toHaveLength(0);
    const abstract = entry.abstract ?? '';
    // The argument survives even though the styling command is dropped.
    expect(abstract).toContain('H field');
    expect(abstract).toContain('X');
  });

  it('still reports a genuinely unknown command as a parse error', () => {
    const result = loadEntries(
      `
@article{unknown2024,
  title = {Unknown \\definitelynotarealcommand{} here},
  year = {2024},
}
`,
      'biblatex',
    );
    expect(
      result.parseErrors.some((e) =>
        e.message.includes('definitelynotarealcommand'),
      ),
    ).toBe(true);
  });
});
