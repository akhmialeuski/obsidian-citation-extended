import { BaselineStore } from '../../src/notes/baseline-store';
import { buildSyncBlock } from '../../src/core';
import type { IFileSystem } from '../../src/platform/platform-adapter';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeFileSystem(initial?: string): {
  fs: IFileSystem;
  written: { value?: string };
} {
  const written: { value?: string } = { value: initial };
  const fs = {
    exists: jest.fn(() => Promise.resolve(written.value !== undefined)),
    readFile: jest.fn(() => Promise.resolve(written.value ?? '')),
    writeFile: jest.fn((_p: string, data: string) => {
      written.value = data;
      return Promise.resolve();
    }),
  } as unknown as IFileSystem;
  return { fs, written };
}

const BASELINE = {
  frontmatter: { year: 'year: 2023' },
  blocks: { meta: '> [!note] meta\n> ^zc-meta' },
};

interface BaselineFileShape {
  baselines: Record<string, unknown>;
}

describe('BaselineStore', () => {
  it('returns null for unknown citekeys', async () => {
    const { fs } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    expect(await store.get('nope')).toBeNull();
  });

  it('persists and reloads baselines across instances after flush', async () => {
    const { fs, written } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    await store.set('smith2023', BASELINE);
    await store.flush();

    const reloaded = new BaselineStore(fs, '/plugin/baselines.json');
    expect(await reloaded.get('smith2023')).toEqual(BASELINE);
    expect(JSON.parse(written.value!)).toMatchObject({ version: 1 });
  });

  it('does not write to disk until flush is called', async () => {
    const { fs } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    await store.set('a', BASELINE);
    await store.set('b', BASELINE);
    expect(fs.writeFile).not.toHaveBeenCalled();

    await store.flush();
    // The whole map is serialized once, not once per set().
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it('flush is a no-op when nothing changed', async () => {
    const { fs } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    await store.get('anything');
    await store.flush();

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('re-marks dirty and retries on a failed flush', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const { fs } = makeFileSystem();
    (fs.writeFile as jest.Mock)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    await store.set('smith2023', BASELINE);
    await store.flush(); // fails, stays dirty
    await store.flush(); // retries, succeeds

    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('shares a single in-flight read between concurrent first loads', async () => {
    const { fs } = makeFileSystem(
      JSON.stringify({ version: 1, baselines: { smith2023: BASELINE } }),
    );
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    const [a, b] = await Promise.all([
      store.get('smith2023'),
      store.get('smith2023'),
    ]);

    expect(a).toEqual(BASELINE);
    expect(b).toEqual(BASELINE);
    // Both callers awaited the same read; the file was only opened once.
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  // data-protection invariants (regression)

  const OTHER = {
    frontmatter: { year: 'year: 1999' },
    blocks: { meta: '> [!note] other\n> ^zc-meta' },
  };

  it('merge-on-flush preserves baselines advanced by another device', async () => {
    // Session loads an old snapshot; ANOTHER device then writes doe2020 to
    // the file. Our flush must overlay only OUR dirty key, not clobber the
    // whole map back to the stale in-memory state.
    const { fs, written } = makeFileSystem(
      JSON.stringify({ version: 1, baselines: { smith2023: BASELINE } }),
    );
    const store = new BaselineStore(fs, '/plugin/baselines.json');
    await store.get('smith2023'); // populate the cache

    // External writer (other device / sync tool) advances the file.
    written.value = JSON.stringify({
      version: 1,
      baselines: { smith2023: BASELINE, doe2020: OTHER },
    });

    await store.set('new2024', BASELINE);
    await store.flush();

    const onDisk = JSON.parse(written.value) as {
      baselines: Record<string, unknown>;
    };
    expect(Object.keys(onDisk.baselines).sort()).toEqual([
      'doe2020', // survived — would have been wiped by a whole-map write
      'new2024',
      'smith2023',
    ]);
    // The session cache adopted the merged view too.
    expect(await store.get('doe2020')).toEqual(OTHER);
  });

  it('never persists an empty map over a file that failed to read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    // The real data (200 notes' merge history) is on disk but the first read
    // throws (locked / partially-synced file).
    const files: Record<string, string> = {
      '/plugin/baselines.json': JSON.stringify({
        version: 1,
        baselines: { smith2023: BASELINE },
      }),
    };
    let failReads = 1;
    const fs = {
      exists: jest.fn((p: string) => Promise.resolve(p in files)),
      readFile: jest.fn((p: string) => {
        if (failReads > 0) {
          failReads--;
          return Promise.reject(new Error('EBUSY: locked'));
        }
        return Promise.resolve(files[p]);
      }),
      writeFile: jest.fn((p: string, data: string) => {
        files[p] = data;
        return Promise.resolve();
      }),
    } as unknown as IFileSystem;

    const store = new BaselineStore(fs, '/plugin/baselines.json');
    expect(await store.get('smith2023')).toBeNull(); // degraded, not an error

    // A later write triggers flush; by then the file reads fine again — the
    // merge must recover the real data instead of wiping it.
    await store.set('new2024', OTHER);
    await store.flush();

    const onDisk = JSON.parse(files['/plugin/baselines.json']) as {
      baselines: Record<string, unknown>;
    };
    expect(onDisk.baselines.smith2023).toEqual(BASELINE); // NOT wiped
    expect(onDisk.baselines.new2024).toEqual(OTHER);
    warn.mockRestore();
  });

  it('backs up a truly corrupt file before the first overwrite', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const files: Record<string, string> = {
      '/plugin/baselines.json': '{corrupt json',
    };
    const fs = {
      exists: jest.fn((p: string) => Promise.resolve(p in files)),
      readFile: jest.fn((p: string) => Promise.resolve(files[p])),
      writeFile: jest.fn((p: string, data: string) => {
        files[p] = data;
        return Promise.resolve();
      }),
    } as unknown as IFileSystem;

    const store = new BaselineStore(fs, '/plugin/baselines.json');
    await store.set('smith2023', BASELINE);
    await store.flush();

    // The unreadable original was preserved, and the new store is valid.
    expect(files['/plugin/baselines.json.corrupt']).toBe('{corrupt json');
    expect(
      (JSON.parse(files['/plugin/baselines.json']) as BaselineFileShape)
        .baselines.smith2023,
    ).toEqual(BASELINE);
    warn.mockRestore();
  });

  it('goes read-only when the file was written by a newer plugin version', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const newer = JSON.stringify({ version: 2, baselines: {} });
    const { fs, written } = makeFileSystem(newer);
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    await store.set('smith2023', BASELINE);
    await store.flush();

    // Never downgrade-destroy a newer format.
    expect(written.value).toBe(newer);
    expect(fs.writeFile).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stops overwriting when a newer version appears mid-session', async () => {
    // Loaded cleanly at version 1, but another device upgrades the on-disk
    // format before our flush. The flush's merge read must detect the newer
    // version and refuse to write — the load-time guard cannot have fired.
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const { fs, written } = makeFileSystem(
      JSON.stringify({ version: 1, baselines: {} }),
    );
    const store = new BaselineStore(fs, '/plugin/baselines.json');
    await store.set('smith2023', BASELINE); // healthy load at version 1

    const newer = JSON.stringify({ version: 2, baselines: {} });
    written.value = newer; // external upgrade after our load

    await store.flush();

    expect(written.value).toBe(newer); // left intact, never overwritten
    expect(fs.writeFile).not.toHaveBeenCalled();

    // The session is now read-only: a later flush is a no-op too.
    await store.set('doe2020', OTHER);
    await store.flush();
    expect(fs.writeFile).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('starts fresh on a valid but unrecognized store shape', async () => {
    // Valid JSON, but not the { version, baselines } shape (a hand-edit or an
    // unrelated file synced into place). It parses but is unusable → read as
    // empty and backed up before the next write, never merged as real data.
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const original = JSON.stringify({ note: 'not a baseline store' });
    const files: Record<string, string> = {
      '/plugin/baselines.json': original,
    };
    const fs = {
      exists: jest.fn((p: string) => Promise.resolve(p in files)),
      readFile: jest.fn((p: string) => Promise.resolve(files[p])),
      writeFile: jest.fn((p: string, data: string) => {
        files[p] = data;
        return Promise.resolve();
      }),
    } as unknown as IFileSystem;
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    expect(await store.get('smith2023')).toBeNull(); // degraded to empty
    await store.set('smith2023', BASELINE);
    await store.flush();

    // The unrecognized original is preserved; a fresh valid store is written.
    expect(files['/plugin/baselines.json.corrupt']).toBe(original);
    expect(
      (JSON.parse(files['/plugin/baselines.json']) as BaselineFileShape)
        .baselines.smith2023,
    ).toEqual(BASELINE);
    warn.mockRestore();
  });

  it('records a baseline from rendered note content', async () => {
    const { fs } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');
    const rendered = [
      '---',
      'title: "A Study"',
      'year: 2023',
      '---',
      '',
      buildSyncBlock('meta', '**Year:** 2023'),
      '',
      'scaffold text',
    ].join('\n');

    await store.recordFromRender('smith2023', rendered);

    const baseline = await store.get('smith2023');
    expect(baseline!.frontmatter.year).toBe('year: 2023');
    expect(baseline!.blocks.meta).toContain('^zc-meta');
  });

  it('starts fresh on a corrupt store file', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const { fs } = makeFileSystem('{corrupt');
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    expect(await store.get('smith2023')).toBeNull();
    await store.set('smith2023', BASELINE);
    expect(await store.get('smith2023')).toEqual(BASELINE);
    warn.mockRestore();
  });

  it('degrades to in-memory when no file system is available', async () => {
    const store = new BaselineStore(undefined, '');

    await store.set('smith2023', BASELINE);

    expect(await store.get('smith2023')).toEqual(BASELINE);
  });

  it('seeds a corrupt-disk flush from the session cache, not from empty', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    // Healthy initial load: the session cache holds smith2023 + doe2020.
    const files: Record<string, string> = {
      '/plugin/baselines.json': JSON.stringify({
        version: 1,
        baselines: { smith2023: BASELINE, doe2020: OTHER },
      }),
    };
    const fs = {
      exists: jest.fn((p: string) => Promise.resolve(p in files)),
      readFile: jest.fn((p: string) => Promise.resolve(files[p])),
      writeFile: jest.fn((p: string, data: string) => {
        files[p] = data;
        return Promise.resolve();
      }),
    } as unknown as IFileSystem;
    const store = new BaselineStore(fs, '/plugin/baselines.json');
    expect(await store.get('smith2023')).toEqual(BASELINE);

    // A sync tool corrupts the file mid-session; the user updates one note.
    files['/plugin/baselines.json'] = '{corrupt json';
    await store.set('new2024', OTHER);
    await store.flush();

    const onDisk = JSON.parse(files['/plugin/baselines.json']) as {
      baselines: Record<string, unknown>;
    };
    // Every baseline the session knew survives — a `{}` seed would have
    // shrunk the file to just the one dirty key, destroying merge history.
    expect(Object.keys(onDisk.baselines).sort()).toEqual([
      'doe2020',
      'new2024',
      'smith2023',
    ]);
    // The unreadable original was still preserved for inspection.
    expect(files['/plugin/baselines.json.corrupt']).toBe('{corrupt json');
    warn.mockRestore();
  });

  it('does not roll back a baseline set while a flush is in flight', async () => {
    const { fs } = makeFileSystem(
      JSON.stringify({ version: 1, baselines: { smith2023: BASELINE } }),
    );
    const store = new BaselineStore(fs, '/plugin/baselines.json');
    await store.set('smith2023', BASELINE);

    // While flush() awaits its merge read of the file, another caller
    // advances the same key in memory.
    let raced = false;
    (fs.readFile as jest.Mock).mockImplementation(async () => {
      if (!raced) {
        raced = true;
        await store.set('smith2023', OTHER);
      }
      return JSON.stringify({ version: 1, baselines: { smith2023: BASELINE } });
    });

    await store.flush();

    // The adoption pass must not overwrite the newer in-memory value with
    // the stale merged one — the racing set() would be lost entirely.
    expect(await store.get('smith2023')).toEqual(OTHER);

    // And the still-dirty key persists the new value on the next flush.
    await store.flush();
    const reloaded = new BaselineStore(fs, '/plugin/baselines.json');
    (fs.readFile as jest.Mock).mockImplementation(() =>
      Promise.resolve(
        (fs.writeFile as jest.Mock).mock.calls.at(-1)![1] as string,
      ),
    );
    expect(await reloaded.get('smith2023')).toEqual(OTHER);
  });

  it('serializes concurrent flushes so neither loses its keys', async () => {
    // A real on-disk file both flushes read-modify-write; without
    // serialization the second flush merges against a pre-write snapshot and
    // clobbers the first flush's key (which is already cleared from dirtyKeys).
    const files: Record<string, string> = {
      '/plugin/baselines.json': JSON.stringify({ version: 1, baselines: {} }),
    };
    let readDelay = 0;
    const fs = {
      exists: jest.fn((p: string) => Promise.resolve(p in files)),
      readFile: jest.fn(async (p: string) => {
        // Stagger the first read so the two flushes genuinely interleave if
        // they are allowed to run concurrently.
        if (readDelay > 0) {
          readDelay--;
          await Promise.resolve();
          await Promise.resolve();
        }
        return files[p];
      }),
      writeFile: jest.fn((p: string, data: string) => {
        files[p] = data;
        return Promise.resolve();
      }),
    } as unknown as IFileSystem;

    const store = new BaselineStore(fs, '/plugin/baselines.json');
    await store.set('alpha', BASELINE);
    readDelay = 1;
    const flushA = store.flush();
    await store.set('beta', OTHER);
    const flushB = store.flush();
    await Promise.all([flushA, flushB]);

    const onDisk = JSON.parse(files['/plugin/baselines.json']) as {
      baselines: Record<string, unknown>;
    };
    expect(Object.keys(onDisk.baselines).sort()).toEqual(['alpha', 'beta']);
  });

  it('seeds from the session cache when the file is deleted mid-session', async () => {
    const files: Record<string, string> = {
      '/plugin/baselines.json': JSON.stringify({
        version: 1,
        baselines: { smith2023: BASELINE, doe2020: OTHER },
      }),
    };
    const fs = {
      exists: jest.fn((p: string) => Promise.resolve(p in files)),
      readFile: jest.fn((p: string) => Promise.resolve(files[p])),
      writeFile: jest.fn((p: string, data: string) => {
        files[p] = data;
        return Promise.resolve();
      }),
    } as unknown as IFileSystem;
    const store = new BaselineStore(fs, '/plugin/baselines.json');
    expect(await store.get('smith2023')).toEqual(BASELINE); // populate cache

    // A sync tool (iCloud eviction / Syncthing) removes the file, then the
    // user updates one note.
    delete files['/plugin/baselines.json'];
    await store.set('new2024', OTHER);
    await store.flush();

    const onDisk = JSON.parse(files['/plugin/baselines.json']) as {
      baselines: Record<string, unknown>;
    };
    // The 97-notes-lost regression: a missing file must seed from the cache,
    // not shrink the store to just the dirty key.
    expect(Object.keys(onDisk.baselines).sort()).toEqual([
      'doe2020',
      'new2024',
      'smith2023',
    ]);
  });

  describe('note-path identity', () => {
    it('stamps the note path on set and returns the baseline for it', async () => {
      const { fs } = makeFileSystem();
      const store = new BaselineStore(fs, '/plugin/baselines.json');

      await store.set('smith2023', BASELINE, 'Notes/@smith2023.md');

      expect(await store.get('smith2023', 'Notes/@smith2023.md')).toEqual({
        ...BASELINE,
        path: 'Notes/@smith2023.md',
      });
    });

    it('returns null for a different file than the baseline was recorded for', async () => {
      const { fs } = makeFileSystem();
      const store = new BaselineStore(fs, '/plugin/baselines.json');

      await store.set('smith2023', BASELINE, 'Notes/@smith2023.md');

      // The citekey now resolves elsewhere (renamed note / changed title
      // template) — merging that file against this baseline would misread
      // its content, so it must behave like a first sync.
      expect(
        await store.get('smith2023', 'Elsewhere/@smith2023.md'),
      ).toBeNull();
    });

    it('accepts a legacy baseline without a recorded path', async () => {
      const { fs } = makeFileSystem(
        JSON.stringify({ version: 1, baselines: { smith2023: BASELINE } }),
      );
      const store = new BaselineStore(fs, '/plugin/baselines.json');

      expect(await store.get('smith2023', 'Notes/@smith2023.md')).toEqual(
        BASELINE,
      );
    });

    it('returns the baseline regardless of path when no path is asked for', async () => {
      const { fs } = makeFileSystem();
      const store = new BaselineStore(fs, '/plugin/baselines.json');

      await store.set('smith2023', BASELINE, 'Notes/@smith2023.md');

      expect(await store.get('smith2023')).toMatchObject(BASELINE);
    });
  });
});
