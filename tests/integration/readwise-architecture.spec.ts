/**
 * Regression tests for the Readwise architecture fix.
 *
 * Verifies the three invariants that were broken by the initial
 * Readwise integration and restored by this refactoring:
 *
 * 1. ENTRY_ADAPTERS / FORMAT_PARSERS are strict Record<DatabaseType, ...>
 *    (compile-time exhaustiveness, no Partial<> wrapper).
 * 2. Only ONE database format for Readwise: 'readwise'.
 * 3. ReadwiseSource goes through the worker pipeline (same as file-based sources).
 */
jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import { DATABASE_FORMATS, DATABASE_TYPE_LABELS } from '../../src/core';
import type { DatabaseType } from '../../src/core';
import { loadEntries } from '../../src/core/parsing/entry-parser';
import { convertToEntries } from '../../src/core/adapters/entry-adapter-factory';
import { ReadwiseSource } from '../../src/sources/readwise-source';
import {
  ReadwiseApiClient,
  ReadwiseExportBook,
} from '../../src/core/readwise/readwise-api-client';
import { ReadwiseEntryData } from '../../src/core/adapters/readwise-adapter';

// Silence expected console.error/warn from parsers handling empty/invalid input
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Invariant 1: Strict Record exhaustiveness
// ---------------------------------------------------------------------------

describe('Invariant 1: Strict Record coverage', () => {
  const allFormats = Object.values(DATABASE_FORMATS) as DatabaseType[];

  it('DATABASE_TYPE_LABELS has an entry for every DatabaseType', () => {
    for (const format of allFormats) {
      expect(DATABASE_TYPE_LABELS[format]).toBeDefined();
      expect(typeof DATABASE_TYPE_LABELS[format]).toBe('string');
    }
  });

  it('loadEntries (FORMAT_PARSERS) handles every DatabaseType without "unsupported" error', () => {
    // For each format, calling with an empty valid payload should NOT return
    // an "Unsupported database format" error.
    const validPayloads: Record<DatabaseType, string> = {
      'csl-json': '[]',
      biblatex: '',
      hayagriva: '',
      readwise: '[]',
    };

    for (const format of allFormats) {
      const result = loadEntries(validPayloads[format], format);
      const unsupportedErrors = result.parseErrors.filter((e) =>
        e.message.includes('Unsupported database format'),
      );
      expect(unsupportedErrors).toEqual([]);
    }
  });

  it('convertToEntries (ENTRY_ADAPTERS) handles every DatabaseType without throwing UnsupportedFormatError', () => {
    for (const format of allFormats) {
      // Empty array should never throw for any format
      expect(() => convertToEntries(format, [])).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: Single Readwise database format
// ---------------------------------------------------------------------------

describe('Invariant 2: Single Readwise database format', () => {
  it('DATABASE_FORMATS has exactly one Readwise entry', () => {
    const readwiseFormats = Object.entries(DATABASE_FORMATS).filter(([, v]) =>
      (v as string).includes('readwise'),
    );
    expect(readwiseFormats).toHaveLength(1);
    expect(readwiseFormats[0]).toEqual(['Readwise', 'readwise']);
  });

  it('old format strings are not present in DATABASE_FORMATS values', () => {
    const allValues = Object.values(DATABASE_FORMATS);
    expect(allValues).not.toContain('readwise-highlights');
    expect(allValues).not.toContain('reader-documents');
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: ReadwiseSource uses the worker pipeline
// ---------------------------------------------------------------------------

describe('Invariant 3: ReadwiseSource worker pipeline', () => {
  function makeExportBook(): ReadwiseExportBook {
    return {
      user_book_id: 1,
      title: 'Test Book',
      author: 'Test Author',
      readable_title: 'Test Book',
      source: 'kindle',
      cover_image_url: 'https://img.com/cover.jpg',
      unique_url: null,
      book_tags: [],
      category: 'books',
      readwise_url: 'https://readwise.io/bookreview/1',
      source_url: null,
      asin: null,
      highlights: [],
      document_note: null,
      summary: null,
      num_highlights: 0,
    };
  }

  it('load() calls worker.post() with database type "readwise"', async () => {
    const client = {
      fetchExportBooks: jest.fn().mockResolvedValue([makeExportBook()]),
      fetchReaderDocuments: jest.fn(),
      validateToken: jest.fn(),
    } as unknown as ReadwiseApiClient;

    const workerPost = jest.fn().mockResolvedValue({
      entries: [
        {
          mode: 'readwise-highlights',
          rawId: '1',
          title: 'Test Book',
          author: 'Test Author',
          category: 'books',
          sourceUrl: null,
          readwiseUrl: 'https://readwise.io/bookreview/1',
          coverImageUrl: null,
          summary: null,
          highlightsText: null,
          highlightCount: 0,
          tags: [],
          publishedDate: null,
          updatedAt: null,
        } as ReadwiseEntryData,
      ],
      parseErrors: [],
    });

    const worker = { post: workerPost };

    const source = new ReadwiseSource(
      'test-id',
      client,
      'readwise-highlights',
      worker as never,
    );

    const result = await source.load();

    // Verify worker was called
    expect(workerPost).toHaveBeenCalledTimes(1);

    // Verify the database type passed to worker is 'readwise' (not mode-specific)
    expect(workerPost.mock.calls[0][0].databaseType).toBe('readwise');

    // Verify entries go through convertToEntries (they should be proper Entry objects)
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].citekey).toBe('rw-1');
  });

  it('load() calls worker even for empty results', async () => {
    const client = {
      fetchExportBooks: jest.fn().mockResolvedValue([]),
      fetchReaderDocuments: jest.fn(),
      validateToken: jest.fn(),
    } as unknown as ReadwiseApiClient;

    const workerPost = jest.fn().mockResolvedValue({
      entries: [],
      parseErrors: [],
    });

    const worker = { post: workerPost };

    const source = new ReadwiseSource(
      'test-id',
      client,
      'readwise-highlights',
      worker as never,
    );

    const result = await source.load();

    // Worker MUST have been called even for empty results
    expect(workerPost).toHaveBeenCalledTimes(1);
    expect(result.entries).toEqual([]);
  });
});
