import * as fs from 'fs';
import * as path from 'path';

import {
  Library,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  loadEntries,
  EntryDataBibLaTeX,
  EntryDataCSL,
} from '../../src/core';

function loadBibLaTeXEntries(filename: string): EntryDataBibLaTeX[] {
  const biblatexPath = path.join(__dirname, '../fixtures', filename);
  const biblatex = fs.readFileSync(biblatexPath, 'utf-8');
  return loadEntries(biblatex, 'biblatex').entries as EntryDataBibLaTeX[];
}

function loadBibLaTeXLibrary(entries: EntryDataBibLaTeX[]): Library {
  return new Library(
    Object.fromEntries(
      entries.map((e: EntryDataBibLaTeX) => [
        e.key,
        new EntryBibLaTeXAdapter(e),
      ]),
    ),
  );
}

describe('biblatex library', () => {
  let entries: EntryDataBibLaTeX[];
  beforeEach(() => {
    entries = loadBibLaTeXEntries('library.bib');
  });
  const loadLibrary = () => loadBibLaTeXLibrary(entries);

  test('loads', () => {
    expect(entries.length).toBe(5);
  });

  test('can support library', () => {
    loadLibrary();
  });
});

describe('biblatex regression tests', () => {
  test('regression 7f9aefe (non-fatal parser error handling)', () => {
    const load = () => {
      loadBibLaTeXLibrary(loadBibLaTeXEntries('regression_7f9aefe.bib'));
    };

    // unknownCommandHandler resolves unknown TeX commands silently — no warnings expected
    const warnCallback = jest.fn();
    jest.spyOn(global.console, 'warn').mockImplementation(warnCallback);

    expect(load).not.toThrow();
    expect(warnCallback).not.toHaveBeenCalled();
  });

  test('regression fe15ef6 (fatal parser error handling)', () => {
    const load = () => {
      loadBibLaTeXLibrary(loadBibLaTeXEntries('regression_fe15ef6.bib'));
    };

    // Make sure we log warning
    const warnCallback = jest.fn();
    jest.spyOn(global.console, 'error').mockImplementation(warnCallback);

    expect(load).not.toThrow();
    expect(warnCallback.mock.calls.length).toBe(1);
  });
});

describe('biblatex cyrchar (Cyrillic) handling', () => {
  test('parses \\cyrchar commands into Cyrillic Unicode characters', () => {
    const entries = loadBibLaTeXEntries('cyrchar_entries.bib');
    const library = loadBibLaTeXLibrary(entries);

    expect(entries).toHaveLength(3);

    const simple = library.entries['CyrillicSimple'];
    expect(simple?.title).toBe('Аналіз');

    const mixed = library.entries['CyrillicMixed'];
    expect(mixed?.title).toBe('131. Нязручная рэчаіснасць');

    const upperLower = library.entries['CyrillicUpperLower'];
    expect(upperLower?.title).toBe('Беларусь');
  });

  test('does not emit warnings for \\cyrchar commands', () => {
    const warnCallback = jest.fn();
    jest.spyOn(global.console, 'warn').mockImplementation(warnCallback);

    loadBibLaTeXEntries('cyrchar_entries.bib');

    expect(warnCallback).not.toHaveBeenCalled();
  });
});

describe('csl library', () => {
  let entries: EntryDataCSL[];
  beforeEach(() => {
    const cslPath = path.join(__dirname, '../fixtures/library.json');
    const csl = fs.readFileSync(cslPath, 'utf-8');
    entries = loadEntries(csl, 'csl-json').entries as EntryDataCSL[];
  });

  test('loads', () => {
    expect(entries.length).toBe(5);
  });

  function loadLibrary(): Library {
    return new Library(
      Object.fromEntries(
        entries.map((e: EntryDataCSL) => [e.id, new EntryCSLAdapter(e)]),
      ),
    );
  }

  test('can support library', () => {
    loadLibrary();
  });
});
