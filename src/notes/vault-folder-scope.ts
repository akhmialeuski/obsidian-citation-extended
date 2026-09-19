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
 * True when `folder` denotes the vault root itself.
 *
 * Note handling asks this twice — once about a raw folder setting and once
 * about its normalized form — and folder creation asks it again, so the list
 * of spellings that mean "the root" lives here instead of being re-typed at
 * each site.
 */
export function isVaultRoot(folder: string): boolean {
  return folder === '' || folder === '/' || folder === '.' || folder === './';
}

/**
 * Lowercased path prefix that scopes a vault search to `folder`, or `null`
 * when `folder` denotes the vault root (i.e. search the whole vault).
 *
 * `folder` is used verbatim apart from normalization, because the same
 * setting builds the note path it has to match: trimming here but not in
 * `getPathForCitekey` would scope the search to `reading notes` while notes
 * are written to `  reading notes/`, and every lookup would miss.
 *
 * @param folder        Raw folder setting; may be empty, `/`, `.` or a real path.
 * @param normalizePath Platform path normalizer (Obsidian's `normalizePath`).
 */
export function vaultFolderScope(
  folder: string,
  normalizePath: (path: string) => string,
): string | null {
  // A root folder never reaches the normalizer: normalizing '' yields '/',
  // which is indistinguishable from a user who configured the root literally.
  if (isVaultRoot(folder)) return null;

  const normalized = normalizePath(folder);
  // Normalization can still land on the root ('//' collapses to '/'), and a
  // normalizer that blanks its input leaves ''.
  if (isVaultRoot(normalized)) return null;
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
