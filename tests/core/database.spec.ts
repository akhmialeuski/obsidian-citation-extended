import {
  generateDatabaseId,
  resolveReadwiseFilters,
  resolveZoteroExportNotes,
  resolveZoteroImportAnnotations,
} from '../../src/core/types/database';
import type { DatabaseConfig } from '../../src/core/types/database';

jest.mock('obsidian', () => ({}), { virtual: true });

describe('generateDatabaseId', () => {
  it('returns string matching db-{timestamp}-{random4} format', () => {
    const id = generateDatabaseId();
    expect(id).toMatch(/^db-\d+-[a-z0-9]{4}$/);
  });

  it('two consecutive calls return different ids', () => {
    const id1 = generateDatabaseId();
    const id2 = generateDatabaseId();
    expect(id1).not.toBe(id2);
  });

  it('starts with "db-" prefix', () => {
    const id = generateDatabaseId();
    expect(id.startsWith('db-')).toBe(true);
  });

  it('contains a numeric timestamp portion', () => {
    const before = Date.now();
    const id = generateDatabaseId();
    const after = Date.now();

    // Extract timestamp from id
    const parts = id.split('-');
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe('resolveReadwiseFilters', () => {
  const databases: DatabaseConfig[] = [
    {
      id: 'db-rw',
      name: 'Readwise',
      type: 'readwise',
      path: 'token',
      readwiseFilters: { categories: ['books'] },
    },
    { id: 'db-bib', name: 'Zotero', type: 'biblatex', path: '/z.bib' },
  ];

  it('returns the matching database filters', () => {
    expect(resolveReadwiseFilters(databases, 'db-rw')).toEqual({
      categories: ['books'],
    });
  });

  it('returns undefined for a non-matching id', () => {
    expect(resolveReadwiseFilters(databases, 'nope')).toBeUndefined();
  });

  it('returns undefined for an undefined id (never matches an id-less db)', () => {
    const withIdless: DatabaseConfig[] = [
      { name: 'Idless', type: 'readwise', path: 't' },
    ];
    expect(resolveReadwiseFilters(withIdless, undefined)).toBeUndefined();
  });
});

describe('resolveZoteroExportNotes', () => {
  const databases: DatabaseConfig[] = [
    {
      id: 'db-z',
      name: 'Zotero live',
      type: 'csl-json',
      path: 'http://127.0.0.1:23119/better-bibtex/collection?/0/AB.json',
      sourceType: 'zotero',
      zoteroExportNotes: true,
    },
    { id: 'db-z2', name: 'Zotero no notes', type: 'biblatex', path: 'url' },
  ];

  it('returns the matching database flag', () => {
    expect(resolveZoteroExportNotes(databases, 'db-z')).toBe(true);
  });

  it('returns false when the flag is unset', () => {
    expect(resolveZoteroExportNotes(databases, 'db-z2')).toBe(false);
  });

  it('returns false for a non-matching id', () => {
    expect(resolveZoteroExportNotes(databases, 'nope')).toBe(false);
  });

  it('returns false for an undefined id', () => {
    expect(resolveZoteroExportNotes(databases, undefined)).toBe(false);
  });
});

describe('resolveZoteroImportAnnotations', () => {
  const databases: DatabaseConfig[] = [
    {
      id: 'db-z',
      name: 'Zotero live',
      type: 'csl-json',
      path: 'http://127.0.0.1:23119/better-bibtex/collection?/0/AB.json',
      sourceType: 'zotero',
      zoteroImportAnnotations: true,
    },
    { id: 'db-z2', name: 'Zotero plain', type: 'biblatex', path: 'url' },
  ];

  it('returns the matching database flag', () => {
    expect(resolveZoteroImportAnnotations(databases, 'db-z')).toBe(true);
  });

  it('returns false when the flag is unset', () => {
    expect(resolveZoteroImportAnnotations(databases, 'db-z2')).toBe(false);
  });

  it('returns false for a non-matching id', () => {
    expect(resolveZoteroImportAnnotations(databases, 'nope')).toBe(false);
  });

  it('returns false for an undefined id', () => {
    expect(resolveZoteroImportAnnotations(databases, undefined)).toBe(false);
  });
});
