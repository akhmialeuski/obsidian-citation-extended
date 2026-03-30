/**
 * Tests for the Readwise format in the entry parser + adapter factory pipeline.
 *
 * Verifies that ReadwiseEntryData flows through loadEntries() (parser) and
 * convertToEntries() (adapter factory) identically to other formats, ensuring
 * the strict Record<DatabaseType, ...> coverage is exercised at runtime.
 */
jest.mock('obsidian', () => ({}), { virtual: true });

import {
  loadEntries,
  convertToEntries,
  DATABASE_FORMATS,
} from '../../src/core';
import {
  ReadwiseAdapter,
  ReadwiseEntryData,
} from '../../src/core/adapters/readwise-adapter';

function makeReadwiseEntryData(
  overrides: Partial<ReadwiseEntryData> = {},
): ReadwiseEntryData {
  return {
    mode: 'readwise-highlights',
    rawId: '42',
    title: 'Test Book',
    author: 'Test Author',
    category: 'books',
    sourceUrl: 'https://example.com',
    readwiseUrl: 'https://readwise.io/book/42',
    coverImageUrl: null,
    summary: 'A summary',
    highlightsText: 'Some highlight',
    highlightCount: 1,
    tags: ['science'],
    publishedDate: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('loadEntries (readwise format)', () => {
  it('parses a JSON array of ReadwiseEntryData', () => {
    const data = [
      makeReadwiseEntryData(),
      makeReadwiseEntryData({ rawId: '43' }),
    ];
    const raw = JSON.stringify(data);

    const result = loadEntries(raw, DATABASE_FORMATS.Readwise);

    expect(result.entries).toHaveLength(2);
    expect(result.parseErrors).toEqual([]);
  });

  it('returns empty array for empty JSON array', () => {
    const result = loadEntries('[]', DATABASE_FORMATS.Readwise);

    expect(result.entries).toEqual([]);
    expect(result.parseErrors).toEqual([]);
  });

  it('returns parse error for invalid JSON', () => {
    // Silence the expected console.error from the catch block
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = loadEntries('not json', DATABASE_FORMATS.Readwise);

    expect(result.entries).toEqual([]);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0].message).toContain('readwise parse error');
  });

  it('preserves all entry data fields through serialization round-trip', () => {
    const data = makeReadwiseEntryData({
      mode: 'reader-documents',
      rawId: 'doc-99',
      title: 'My Article',
      tags: ['ai', 'ml'],
    });
    const raw = JSON.stringify([data]);

    const result = loadEntries(raw, DATABASE_FORMATS.Readwise);
    const entry = result.entries[0] as ReadwiseEntryData;

    expect(entry.mode).toBe('reader-documents');
    expect(entry.rawId).toBe('doc-99');
    expect(entry.title).toBe('My Article');
    expect(entry.tags).toEqual(['ai', 'ml']);
  });
});

describe('convertToEntries (readwise format)', () => {
  it('creates ReadwiseAdapter instances from ReadwiseEntryData', () => {
    const data = [
      makeReadwiseEntryData(),
      makeReadwiseEntryData({ rawId: '43' }),
    ];

    const entries = convertToEntries(DATABASE_FORMATS.Readwise, data);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toBeInstanceOf(ReadwiseAdapter);
    expect(entries[1]).toBeInstanceOf(ReadwiseAdapter);
  });

  it('adapters expose correct id/citekey from ReadwiseEntryData', () => {
    const data = [
      makeReadwiseEntryData({ mode: 'readwise-highlights', rawId: '100' }),
      makeReadwiseEntryData({ mode: 'reader-documents', rawId: 'doc-abc' }),
    ];

    const entries = convertToEntries(DATABASE_FORMATS.Readwise, data);

    expect(entries[0].id).toBe('rw-100');
    expect(entries[0].citekey).toBe('rw-100');
    expect(entries[1].id).toBe('rd-doc-abc');
    expect(entries[1].citekey).toBe('rd-doc-abc');
  });

  it('adapters expose standard Entry fields', () => {
    const data = [
      makeReadwiseEntryData({
        title: 'Deep Work',
        author: 'Cal Newport',
        category: 'books',
        summary: 'Focus matters',
      }),
    ];

    const entries = convertToEntries(DATABASE_FORMATS.Readwise, data);
    const entry = entries[0];

    expect(entry.title).toBe('Deep Work');
    expect(entry.type).toBe('book');
    expect(entry.abstract).toBe('Focus matters');
  });
});
