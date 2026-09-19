import { posix } from 'path';
import {
  isPathInVaultFolder,
  isVaultRoot,
  vaultFolderScope,
} from '../../src/notes/vault-folder-scope';
import { normalizePathLikeObsidian } from '../helpers/normalize-path';

const scope = (folder: string): string | null =>
  vaultFolderScope(folder, normalizePathLikeObsidian);

describe('vaultFolderScope', () => {
  // The bug behind issue #86: Obsidian's normalizePath turns every spelling
  // of the vault root into '/', so code comparing its output to '' to mean
  // "no restriction" scopes the search to a prefix no path can match.
  it.each(['', '/', '//', '.', './'])(
    'treats %p as the whole vault',
    (folder) => {
      expect(scope(folder)).toBeNull();
    },
  );

  it('never returns the normalizer root marker as a prefix', () => {
    expect(normalizePathLikeObsidian('')).toBe('/');
    expect(scope('')).not.toBe('/');
  });

  it('lowercases a real folder so matching is case-insensitive', () => {
    expect(scope('Reading Notes')).toBe('reading notes');
  });

  it('normalizes separators and strips surrounding slashes', () => {
    expect(scope('/Reading\\Notes/')).toBe('reading/notes');
  });

  it('does not consult the normalizer for an empty folder', () => {
    const normalize = jest.fn(normalizePathLikeObsidian);
    expect(vaultFolderScope('', normalize)).toBeNull();
    expect(normalize).not.toHaveBeenCalled();
  });

  it('keeps surrounding whitespace so the scope matches the note path', () => {
    // getPathForCitekey joins the folder setting verbatim, so a setting with
    // stray whitespace writes notes to '  Reading notes/...'. Trimming here
    // would scope the search to 'reading notes', which that path does not
    // start with, and every lookup in the folder would miss.
    const folder = '  Reading notes';
    const notePath = posix.join(folder, 'My Title.md');

    expect(isPathInVaultFolder(notePath, scope(folder))).toBe(true);
  });

  it('falls back to the whole vault when the normalizer blanks the folder', () => {
    expect(vaultFolderScope('Notes', () => '')).toBeNull();
  });
});

describe('isPathInVaultFolder', () => {
  it('accepts every path under a null (vault root) scope', () => {
    expect(isPathInVaultFolder('Anywhere/Deep/note.md', null)).toBe(true);
  });

  it('accepts a file directly inside the scoped folder', () => {
    expect(isPathInVaultFolder('Reading notes/note.md', 'reading notes')).toBe(
      true,
    );
  });

  it('accepts a file in a nested subfolder', () => {
    expect(
      isPathInVaultFolder('Reading notes/2024/note.md', 'reading notes'),
    ).toBe(true);
  });

  it('accepts the scoped path itself', () => {
    expect(isPathInVaultFolder('Reading notes', 'reading notes')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isPathInVaultFolder('READING NOTES/x.md', 'reading notes')).toBe(
      true,
    );
  });

  it('rejects a sibling folder sharing the scope as a name prefix', () => {
    expect(
      isPathInVaultFolder('Reading notes archive/x.md', 'reading notes'),
    ).toBe(false);
  });

  it('rejects a path outside the scope', () => {
    expect(isPathInVaultFolder('Other/x.md', 'reading notes')).toBe(false);
  });
});

describe('isVaultRoot', () => {
  it.each(['', '/', '.', './'])('recognises %p as the vault root', (folder) => {
    expect(isVaultRoot(folder)).toBe(true);
  });

  it.each(['Reading notes', '/Reading notes', '..', '   '])(
    'does not mistake %p for the vault root',
    (folder) => {
      expect(isVaultRoot(folder)).toBe(false);
    },
  );
});
