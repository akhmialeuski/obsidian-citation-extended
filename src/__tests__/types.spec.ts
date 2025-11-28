import * as fs from 'fs';
import * as path from 'path';

import {
  Library,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  loadEntries,
  EntryDataBibLaTeX,
  EntryDataCSL,
} from '../types';

function loadBibLaTeXEntries(filename: string): EntryDataBibLaTeX[] {
  const biblatexPath = path.join(__dirname, filename);
  const biblatex = fs.readFileSync(biblatexPath, 'utf-8');
  return loadEntries(biblatex, 'biblatex') as EntryDataBibLaTeX[];
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

    // Make sure we log warning
    const warnCallback = jest.fn();
    jest.spyOn(global.console, 'warn').mockImplementation(warnCallback);

    expect(load).not.toThrow();
    expect(warnCallback.mock.calls.length).toBe(1);
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

describe('csl library', () => {
  let entries: EntryDataCSL[];
  beforeEach(() => {
    const cslPath = path.join(__dirname, 'library.json');
    const csl = fs.readFileSync(cslPath, 'utf-8');
    entries = loadEntries(csl, 'csl-json') as EntryDataCSL[];
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
