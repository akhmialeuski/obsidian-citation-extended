// Keeps versions.json in sync with manifest.json on every release.
//
// Run automatically as the standard-version `postbump` hook (see the
// "standard-version" block in package.json): after standard-version has bumped
// manifest.json's `version`, this maps that new version to the current
// `minAppVersion` so Obsidian can resolve the latest plugin build compatible
// with a user's app version. It can also be run manually after editing
// manifest.minAppVersion: `node version-bump.mjs`.
//
// It reads the version from manifest.json (not process.env.npm_package_version)
// so it is correct regardless of the invocation context.

import { readFileSync, writeFileSync } from 'fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { version, minAppVersion } = manifest;

if (!version || !minAppVersion) {
  throw new Error('manifest.json is missing "version" or "minAppVersion".');
}

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[version] = minAppVersion;

// 2-space indent + trailing newline to match the repo's Prettier JSON style.
writeFileSync('versions.json', `${JSON.stringify(versions, null, 2)}\n`);

console.log(`versions.json: ${version} -> ${minAppVersion}`);
