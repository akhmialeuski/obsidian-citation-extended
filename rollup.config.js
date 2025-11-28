import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

import replace from '@rollup/plugin-replace';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    sourcemap: 'inline',
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
      sourcemap: true,
    }),
    {
      name: 'copy-static-files',
      writeBundle() {
        const fs = require('fs');

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
        if (fs.existsSync('versions.json')) {
          fs.copyFileSync('versions.json', 'dist/versions.json');
        }
      }
    }
  ],
};
