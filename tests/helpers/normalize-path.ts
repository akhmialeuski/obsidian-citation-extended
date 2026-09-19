/**
 * Approximation of Obsidian's `normalizePath`, for tests.
 *
 * The previous test doubles used the identity function, which quietly
 * disagrees with the real implementation in exactly the case that matters for
 * folder scoping: `normalizePath('')` returns `'/'`, not `''`. A lookup bug
 * that hinged on that difference passed every test (see issue #86). Mirroring
 * the real behaviour here keeps that class of bug visible.
 *
 * "Approximation", not "faithful copy": `normalizePath` is not part of the
 * published `obsidian` package, which ships type declarations only, and the
 * API docs describe neither the empty-string return nor `./` handling. The
 * `'' -> '/'` behaviour pinned here was observed in a debug build against
 * Obsidian 1.13.7 while diagnosing #86; the rest mirrors the documented
 * description — collapse runs of `/` and `\`, strip leading and trailing
 * slashes, replace non-breaking spaces with ordinary ones, NFC-normalize.
 *
 * Production code must not depend on which variant ships. `vaultFolderScope`
 * is tested against a normalizer returning `''` as well, so the lookup holds
 * either way.
 */
export function normalizePathLikeObsidian(path: string): string {
  const cleaned = path
    .replace(/([\\/])+/g, '/')
    .replace(/(^\/+|\/+$)/g, '')
    .replace(/\u00A0|\u202F/g, ' ')
    .normalize('NFC');
  return cleaned || '/';
}
