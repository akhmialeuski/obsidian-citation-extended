import { extractCitekeyAtCursor } from '../../src/application/citekey-extractor';
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
    expect(
      extractCitekeyAtCursor(makeEditor('[[@smith2023|Smith]]', 5)),
    ).toBe('smith2023');
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
    expect(extractCitekeyAtCursor(makeEditor('no citation here', 5))).toBeNull();
  });

  it('returns null for empty line', () => {
    expect(extractCitekeyAtCursor(makeEditor('', 0))).toBeNull();
  });

  it('handles citekey with special characters', () => {
    expect(
      extractCitekeyAtCursor(makeEditor('[@doe:2023-review]', 5)),
    ).toBe('doe:2023-review');
  });
});
