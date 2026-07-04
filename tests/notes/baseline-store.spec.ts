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

  // --- data-protection invariants (regression) ------------------------------

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
});
