/**
 * Folder scoping for vault-wide note lookups.
 *
 * Obsidian's `normalizePath` maps EVERY spelling of the vault root — `''`,
 * `'/'`, `'//'` — onto the single string `'/'`; it never returns `''`. Code
 * that normalizes a folder setting and then compares the result against `''`
 * to mean "no folder restriction" therefore takes a branch that can never be
 * reached, and falls through to a prefix test against `'/'` — which no
 * vault-relative path starts with, so the scope matches nothing at all.
 *
 * Collapsing every root spelling to a single explicit `null` keeps that trap
 * in one place: callers get a value whose "whole vault" case is impossible to
 * confuse with a real folder prefix.
 */

/**
 * Lowercased path prefix that scopes a vault search to `folder`, or `null`
 * when `folder` denotes the vault root (i.e. search the whole vault).
 *
 * @param folder        Raw folder setting; may be empty, `/`, `.` or a real path.
 * @param normalizePath Platform path normalizer (Obsidian's `normalizePath`).
 */
export function vaultFolderScope(
  folder: string,
  normalizePath: (path: string) => string,
): string | null {
  // Normalizing an empty/blank folder yields '/', which is indistinguishable
  // from a user who literally configured the vault root — both mean "whole
  // vault", so neither needs to reach the normalizer.
  if (!folder.trim()) return null;

  const normalized = normalizePath(folder).trim();
  // '/' is normalizePath's root marker; '.' and './' survive normalization
  // untouched but mean the same thing to a user typing a folder setting.
  if (normalized === '' || normalized === '/' || normalized === '.') {
    return null;
  }
  return normalized.toLowerCase();
}

/**
 * True when `path` is the scoped folder itself or lives anywhere beneath it.
 * A `null` scope (the vault root) contains every path.
 *
 * Matching is case-insensitive to mirror the case-insensitive note lookups
 * this backs; `scope` is already lowercased by {@link vaultFolderScope}.
 */
export function isPathInVaultFolder(
  path: string,
  scope: string | null,
): boolean {
  if (scope === null) return true;
  const lowered = path.toLowerCase();
  return lowered === scope || lowered.startsWith(`${scope}/`);
}
