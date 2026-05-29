import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import fs from 'fs';

import replace from '@rollup/plugin-replace';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';

// Rollup sets ROLLUP_WATCH=true in `--watch` (dev) mode. Production builds
// (`npm run build`) ship without source maps: inline maps embed the entire
// source as base64, inflating main.js past Obsidian Sync's 5 MB limit.
const isProd = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    sourcemap: isProd ? false : 'inline',
    format: 'cjs',
    exports: 'default',
  },
  external: ['obsidian', 'path', 'fs', 'util', 'events', 'stream', 'os'],
  plugins: [
    /**
     * Chokidar hacks to get working with platform-general Electron build.
     *
     * HACK: Manually replace fsevents import. This is only available on OS X,
     * and we need to make a platform-general build here.
     */
    replace({
      preventAssignment: true,
      delimiters: ['', ''],
      include: "node_modules/chokidar/**/*.js",

      "require('fsevents')": "null",
      "require('fs')": "require('original-fs')",
    }),

    typescript({
      outputToFilesystem: false,
    }),
    nodeResolve({ browser: true }),
    commonjs({ ignore: ['original-fs'] }),
    json(),
    webWorkerLoader({
      targetPlatform: 'browser',
      extensions: ['.ts'],
      preserveSource: true,
      sourcemap: !isProd,
    }),
    {
      name: 'copy-static-files',
      writeBundle() {
        // Ensure dist exists (rollup should create it, but just in case)
        if (!fs.existsSync('dist')) {
          fs.mkdirSync('dist');
        }

        if (fs.existsSync('styles/styles.css')) {
          fs.copyFileSync('styles/styles.css', 'dist/styles.css');
        }
        if (fs.existsSync('manifest.json')) {
          fs.copyFileSync('manifest.json', 'dist/manifest.json');
        }
        // versions.json is intentionally NOT copied: Obsidian only downloads
        // main.js, manifest.json, and styles.css from a release. versions.json
        // lives in the repo root for the plugin-update compatibility check.
      }
    }
  ],
};
