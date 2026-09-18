/**
 * Faithful stand-in for Obsidian's `normalizePath`.
 *
 * The previous test doubles used the identity function, which quietly
 * disagrees with the real implementation in exactly the case that matters for
 * folder scoping: `normalizePath('')` returns `'/'`, not `''`. A lookup bug
 * that hinged on that difference passed every test (see issue #86). Mirroring
 * the real behaviour here keeps that class of bug visible.
 *
 * Behaviour, matching Obsidian: collapse runs of `/` and `\` into a single
 * `/`, strip leading and trailing slashes, replace non-breaking spaces with
 * ordinary ones, NFC-normalize, and fall back to `'/'` when nothing is left.
 */
export function normalizePathLikeObsidian(path: string): string {
  const cleaned = path
    .replace(/([\\/])+/g, '/')
    .replace(/(^\/+|\/+$)/g, '')
    .replace(/\u00A0|\u202F/g, ' ')
    .normalize('NFC');
  return cleaned || '/';
}
