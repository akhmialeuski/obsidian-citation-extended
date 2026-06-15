import {
  extractCitekeyAtCursor,
  extractCitekeysFromText,
} from '../../src/application/citekey-extractor';
import type { IEditorProxy } from '../../src/platform/platform-adapter';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeEditor(line: string, ch: number): IEditorProxy {
  return {
    getCursor: () => ({ line: 0, ch }),
    getLine: () => line,
    getSelection: () => '',
    setCursor: jest.fn(),
    replaceSelection: jest.fn(),
    replaceRange: jest.fn(),
  };
}

describe('extractCitekeyAtCursor', () => {
  it('extracts citekey from [[@citekey]]', () => {
    expect(extractCitekeyAtCursor(makeEditor('[[@smith2023]]', 5))).toBe(
      'smith2023',
    );
  });

  it('extracts citekey from [[@citekey|alias]]', () => {
    expect(extractCitekeyAtCursor(makeEditor('[[@smith2023|Smith]]', 5))).toBe(
      'smith2023',
    );
  });

  it('extracts citekey from [@citekey]', () => {
    expect(extractCitekeyAtCursor(makeEditor('[@smith2023]', 5))).toBe(
      'smith2023',
    );
  });

  it('extracts citekey from standalone @citekey', () => {
    expect(extractCitekeyAtCursor(makeEditor('see @smith2023 for', 8))).toBe(
      'smith2023',
    );
  });

  it('returns null when cursor is not on a citation', () => {
    expect(
      extractCitekeyAtCursor(makeEditor('no citation here', 5)),
    ).toBeNull();
  });

  it('returns null for empty line', () => {
    expect(extractCitekeyAtCursor(makeEditor('', 0))).toBeNull();
  });

  it('handles citekey with special characters', () => {
    expect(extractCitekeyAtCursor(makeEditor('[@doe:2023-review]', 5))).toBe(
      'doe:2023-review',
    );
  });
});

describe('extractCitekeysFromText', () => {
  it('returns an empty array when there are no citations', () => {
    expect(extractCitekeysFromText('just some prose, no refs')).toEqual([]);
  });

  it('extracts a single bracketed citekey', () => {
    expect(extractCitekeysFromText('see [@smith2023] here')).toEqual([
      'smith2023',
    ]);
  });

  it('expands multi-cite Pandoc groups', () => {
    expect(extractCitekeysFromText('text [@a2020; @b2021, p. 3] more')).toEqual(
      ['a2020', 'b2021'],
    );
  });

  it('extracts wiki-link citekeys including aliased ones', () => {
    expect(
      extractCitekeysFromText('[[@smith2023]] and [[@doe2024|Doe]]'),
    ).toEqual(['smith2023', 'doe2024']);
  });

  it('extracts bare citekeys but ignores e-mail addresses', () => {
    expect(
      extractCitekeysFromText('cite @smith2023 — mail john@example.com'),
    ).toEqual(['smith2023']);
  });

  it('preserves first-occurrence order and de-duplicates', () => {
    expect(extractCitekeysFromText('[@a] [@b] [@a] then @c and [@b]')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('handles citekeys with special characters', () => {
    expect(extractCitekeysFromText('[@doe:2023-review]')).toEqual([
      'doe:2023-review',
    ]);
  });

  it('scans across multiple lines in document order', () => {
    const text = 'First [@a2020].\nSecond line @b2021 here.\n[[@c2022]]';
    expect(extractCitekeysFromText(text)).toEqual(['a2020', 'b2021', 'c2022']);
  });

  it('preserves document order across mixed citation forms', () => {
    // wiki, then bare, then group — must come back in that positional order.
    const text = '[[@first]] then @second and [@third; @fourth]';
    expect(extractCitekeysFromText(text)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
  });
});
