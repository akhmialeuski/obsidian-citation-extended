/**
 * Regression coverage for issue #87: the offline caches and the note-baseline
 * store were write-only.
 *
 * `ObsidianFileSystem` read through `FileSystemAdapter.readLocalFile`, which
 * resolves an absolute OS path, while it wrote through `vault.adapter`, which
 * takes a vault-relative one. Neither side was wrong on its own, so the defect
 * lived in the seam between the adapter and its callers and survived unit
 * tests on both: the adapter spec mocked the read away, and the caller specs
 * pass doubles where the path is an opaque key.
 *
 * These tests close that seam by driving the real `ObsidianPlatformAdapter`
 * from the real callers over one vault-relative store, so a future
 * implementation that splits the path space again fails here.
 */

import type { App, Plugin } from 'obsidian';

import { createVaultFileStore } from '../helpers/mock-obsidian';
import { ObsidianPlatformAdapter } from '../../src/platform/obsidian-adapter';
import { BaselineStore } from '../../src/notes/baseline-store';
import {
  readVersionedJsonCache,
  sourceCacheFilePath,
  writeVersionedJsonCache,
} from '../../src/sources/source-utils';
import type { NoteBaseline } from '../../src/core';

jest.mock(
  'obsidian',
  () => {
    const helpers = jest.requireActual<
      typeof import('../helpers/mock-obsidian')
    >('../helpers/mock-obsidian');
    return helpers.OBSIDIAN_MOCK;
  },
  { virtual: true },
);

/** Where Obsidian mounts this plugin — the value `manifest.dir` carries. */
const PLUGIN_DIR = '.obsidian/plugins/citation-extended';

/** Shape of the offline cache, standing in for a source's real cache state. */
interface CacheStateV1 {
  version: 1;
  entries: string[];
}

function isCacheStateV1(parsed: unknown): parsed is CacheStateV1 {
  const state = parsed as CacheStateV1 | null;
  return (
    typeof state === 'object' &&
    state !== null &&
    state.version === 1 &&
    Array.isArray(state.entries)
  );
}

const BASELINE: NoteBaseline = {
  frontmatter: { year: 'year: 2023' },
  blocks: { meta: '> [!note] meta\n> ^zc-meta' },
};

/**
 * The real platform adapter over an in-memory vault, plus the file map so a
 * test can assert that the bytes really landed in the vault.
 */
function createAdapter(): {
  adapter: ObsidianPlatformAdapter;
  files: Map<string, string>;
} {
  const store = createVaultFileStore();
  const app = {
    vault: {
      adapter: {
        read: store.read,
        write: store.write,
        exists: store.exists,
      },
    },
  } as unknown as App;
  const plugin = { addStatusBarItem: jest.fn() } as unknown as Plugin;

  return {
    adapter: new ObsidianPlatformAdapter(app, plugin),
    files: store.files,
  };
}

describe('Issue 87: plugin-managed files survive a write-then-read round trip', () => {
  describe('offline source cache', () => {
    const cachePath = sourceCacheFilePath(
      PLUGIN_DIR,
      'readwise-cache',
      'db-1',
      'readwise:token',
    );

    it('reads back the state it just wrote', async () => {
      const { adapter } = createAdapter();
      const state: CacheStateV1 = { version: 1, entries: ['abc123'] };

      await writeVersionedJsonCache(adapter.fileSystem, cachePath, state);
      const restored = await readVersionedJsonCache(
        adapter.fileSystem,
        cachePath,
        isCacheStateV1,
      );

      // Before the fix this was null: the write landed, the read threw
      // ENOENT, and readVersionedJsonCache's catch reported "no cache" — so
      // every plugin reload re-fetched the whole library.
      expect(restored).toEqual(state);
    });

    it('stores the cache inside the plugin directory', async () => {
      const { adapter, files } = createAdapter();

      await writeVersionedJsonCache(adapter.fileSystem, cachePath, {
        version: 1,
        entries: [],
      });

      expect([...files.keys()]).toEqual([
        `${PLUGIN_DIR}/readwise-cache-db-1.json`,
      ]);
    });

    it('still reports no cache when nothing was ever written', async () => {
      const { adapter } = createAdapter();

      // The failure mode the fix must not introduce: an empty or fabricated
      // cache would let an outage masquerade as an empty library.
      await expect(
        readVersionedJsonCache(adapter.fileSystem, cachePath, isCacheStateV1),
      ).resolves.toBeNull();
    });
  });

  describe('note-baseline store', () => {
    const baselinePath = `${PLUGIN_DIR}/note-baselines.json`;

    it('hands a flushed baseline to the next session', async () => {
      const { adapter } = createAdapter();

      const writer = new BaselineStore(adapter.fileSystem, baselinePath);
      await writer.set('doe2023', BASELINE, 'Literature/Doe 2023.md');
      await writer.flush();

      // A fresh store is what the next Obsidian session gets: it must read the
      // file the previous one wrote, or the three-way merge treats every note
      // as a first sync and can overwrite the user's edits.
      const reader = new BaselineStore(adapter.fileSystem, baselinePath);

      expect(await reader.get('doe2023', 'Literature/Doe 2023.md')).toEqual({
        ...BASELINE,
        path: 'Literature/Doe 2023.md',
      });
    });

    it('backs up an unreadable baselines file before overwriting it', async () => {
      const { adapter, files } = createAdapter();
      files.set(baselinePath, 'not json{{{');

      const store = new BaselineStore(adapter.fileSystem, baselinePath);
      await store.set('doe2023', BASELINE);
      await store.flush();

      // The backup reads the corrupt file back through the same adapter, so
      // before the fix it silently preserved nothing.
      expect(files.get(`${baselinePath}.corrupt`)).toBe('not json{{{');
    });
  });
});
