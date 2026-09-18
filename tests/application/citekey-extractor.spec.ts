import {
  extractCitekeyAtCursor,
  extractCitekeysFromText,
  findCitekeyOccurrences,
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

describe('findCitekeyOccurrences', () => {
  /** The text each reported span actually covers. */
  const slices = (text: string, citekey: string): string[] =>
    findCitekeyOccurrences(text, citekey).map((o) =>
      text.slice(o.start, o.end),
    );

  it('returns nothing for a citekey the text does not mention', () => {
    expect(findCitekeyOccurrences('[@a] and @b', 'c')).toEqual([]);
  });

  it('returns nothing for a blank citekey', () => {
    expect(findCitekeyOccurrences('[@a]', '   ')).toEqual([]);
  });

  it('locates a bare @key', () => {
    const text = 'As shown by @smith2020 earlier.';
    expect(findCitekeyOccurrences(text, 'smith2020')).toEqual([
      { start: 12, end: 22 },
    ]);
    expect(slices(text, 'smith2020')).toEqual(['@smith2020']);
  });

  it('locates a @key at the very start of the text', () => {
    expect(slices('@smith2020 opened the field.', 'smith2020')).toEqual([
      '@smith2020',
    ]);
  });

  it('locates a Pandoc single citation', () => {
    expect(slices('see [@smith2020] here', 'smith2020')).toEqual([
      '@smith2020',
    ]);
  });

  it('locates one member of a Pandoc group without the surrounding bracket', () => {
    const text = 'see [@a2020; @b2021, p. 3] here';
    expect(slices(text, 'b2021')).toEqual(['@b2021']);
    expect(slices(text, 'a2020')).toEqual(['@a2020']);
  });

  it('locates a wiki-link citation', () => {
    expect(slices('see [[@smith2020]] here', 'smith2020')).toEqual([
      '@smith2020',
    ]);
  });

  it('locates a wiki-link citation that carries an alias', () => {
    expect(slices('see [[@smith2020|Smith (2020)]] here', 'smith2020')).toEqual(
      ['@smith2020'],
    );
  });

  it('returns every occurrence in document order across mixed forms', () => {
    const text = '[[@a]] then @a again, plus [@a; @b] and finally [@a].';
    const found = findCitekeyOccurrences(text, 'a');
    expect(found).toHaveLength(4);
    expect(found.map((o) => o.start)).toEqual(
      [...found.map((o) => o.start)].sort((x, y) => x - y),
    );
    expect(slices(text, 'a')).toEqual(['@a', '@a', '@a', '@a']);
  });

  it('spans multiple lines with offsets into the whole document', () => {
    const text = 'First [@a2020].\nSecond @a2020 here.';
    const found = findCitekeyOccurrences(text, 'a2020');
    expect(found).toHaveLength(2);
    expect(text.slice(found[1].start, found[1].end)).toBe('@a2020');
    expect(found[1].start).toBeGreaterThan(text.indexOf('\n'));
  });

  it('does not match a citekey that is only a prefix of the one in the text', () => {
    expect(findCitekeyOccurrences('[@smith2020a]', 'smith2020')).toEqual([]);
  });

  it('ignores an e-mail address that looks like a bare citation', () => {
    expect(
      findCitekeyOccurrences('write to name@example.com', 'example.com'),
    ).toEqual([]);
  });

  it('handles citekeys with special characters', () => {
    expect(slices('[@doe:2023-review]', 'doe:2023-review')).toEqual([
      '@doe:2023-review',
    ]);
  });

  // The panel lists what extractCitekeysFromText finds and jumps with
  // findCitekeyOccurrences. If the two scans ever disagree, a listed citation
  // becomes un-jumpable, so pin the agreement itself.
  it('finds at least one occurrence of every citekey the extractor lists', () => {
    const text = [
      'Intro [[@wiki2020]] and [[@aliased2021|Alias]].',
      'Body @bare2022, then [@group2023; @other2024, p. 7].',
      'Tail [@single2025].',
    ].join('\n');

    const listed = extractCitekeysFromText(text);
    expect(listed.length).toBeGreaterThan(0);
    for (const citekey of listed) {
      const found = findCitekeyOccurrences(text, citekey);
      expect(found.length).toBeGreaterThan(0);
      for (const occurrence of found) {
        expect(text.slice(occurrence.start, occurrence.end)).toBe(
          `@${citekey}`,
        );
      }
    }
  });
});
