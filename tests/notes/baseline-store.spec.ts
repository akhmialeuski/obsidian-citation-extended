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

describe('BaselineStore', () => {
  it('returns null for unknown citekeys', async () => {
    const { fs } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    expect(await store.get('nope')).toBeNull();
  });

  it('persists and reloads baselines across instances', async () => {
    const { fs, written } = makeFileSystem();
    const store = new BaselineStore(fs, '/plugin/baselines.json');

    await store.set('smith2023', BASELINE);

    const reloaded = new BaselineStore(fs, '/plugin/baselines.json');
    expect(await reloaded.get('smith2023')).toEqual(BASELINE);
    expect(JSON.parse(written.value!)).toMatchObject({ version: 1 });
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
