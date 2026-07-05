/**
 * @jest-environment jsdom
 *
 * jsdom provides `window` for the polling timer in ZoteroSource.watch().
 */
jest.mock('obsidian', () => ({}), { virtual: true });
jest.mock('web-worker:../../src/worker', () => ({ default: class {} }), {
  virtual: true,
});

import { ZoteroSource } from '../../src/sources/zotero-source';
import { ZoteroApiError, ZoteroAbortError } from '../../src/core/zotero';
import { DATABASE_FORMATS } from '../../src/core/types/database';
import { loadEntries } from '../../src/core/parsing/entry-parser';
import type { IFileSystem } from '../../src/platform/platform-adapter';

/** Worker manager mock that parses with the real loadEntries pipeline. */
function createMockWorkerManager() {
  return {
    post: jest
      .fn()
      .mockImplementation((msg: { databaseRaw: string; databaseType: never }) =>
        Promise.resolve(loadEntries(msg.databaseRaw, msg.databaseType)),
      ),
  };
}

function createMockFileSystem(initial?: string): {
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

const CSL = JSON.stringify([
  { id: 'smith2023', type: 'article-journal', title: 'A Study' },
  { id: 'doe2024', type: 'book', title: 'A Book' },
]);

function makeClient(impl: () => Promise<string>) {
  return {
    fetchBibliography: jest.fn(impl),
    ping: jest.fn(),
  } as never;
}

describe('ZoteroSource.load', () => {
  it('fetches, parses CSL JSON, and returns typed entries', async () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
    );

    const result = await source.load();

    expect(result.sourceId).toBe('z1');
    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(worker.post).toHaveBeenCalledTimes(1);
  });

  it('passes the exportNotes flag through to the client', async () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      true,
    );

    await source.load();

    expect(
      (client as unknown as { fetchBibliography: jest.Mock }).fetchBibliography,
    ).toHaveBeenCalledWith(expect.objectContaining({ exportNotes: true }));
  });

  it('writes the successful export to the cache', async () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const { fs, written } = createMockFileSystem();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
    );

    await source.load();

    expect(fs.writeFile).toHaveBeenCalled();
    expect(JSON.parse(written.value!)).toMatchObject({
      version: 2,
      format: DATABASE_FORMATS.CslJson,
      raw: CSL,
    });
  });

  it('falls back to the cache when Zotero is unreachable', async () => {
    const cache = JSON.stringify({
      version: 1,
      format: DATABASE_FORMATS.CslJson,
      raw: CSL,
    });
    const client = makeClient(() =>
      Promise.reject(new ZoteroApiError('Could not reach Zotero')),
    );
    const worker = createMockWorkerManager();
    const { fs } = createMockFileSystem(cache);
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
    );

    const result = await source.load();

    expect(result.entries.map((e) => e.id)).toEqual(['smith2023', 'doe2024']);
    expect(result.parseErrors?.[0].message).toMatch(/using cache/);
  });

  it('throws when Zotero is unreachable and no cache exists', async () => {
    const client = makeClient(() =>
      Promise.reject(new ZoteroApiError('Could not reach Zotero')),
    );
    const worker = createMockWorkerManager();
    const { fs } = createMockFileSystem();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
    );

    await expect(source.load()).rejects.toThrow(/Failed to load from Zotero/);
  });

  it('propagates an abort without caching it as a failure', async () => {
    const client = makeClient(() => Promise.reject(new ZoteroAbortError()));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
    );

    await expect(source.load()).rejects.toBeInstanceOf(ZoteroAbortError);
  });
});

describe('ZoteroSource.dispose', () => {
  it('does not throw and stops the polling timer', () => {
    const client = makeClient(() => Promise.resolve(CSL));
    const worker = createMockWorkerManager();
    const source = new ZoteroSource(
      'z1',
      client,
      worker as never,
      DATABASE_FORMATS.CslJson,
      false,
      undefined,
      undefined,
      () => 60_000,
    );
    source.watch(jest.fn());
    expect(() => source.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PDF annotation enrichment
// ---------------------------------------------------------------------------

describe('ZoteroSource annotation enrichment', () => {
  const RAW_ATTACHMENT = {
    open: 'zotero://open-pdf/library/items/ATTKEY01',
    path: '/z/storage/ATTKEY01/paper.pdf',
    annotations: [
      {
        key: 'ANNOT001',
        annotationType: 'highlight',
        annotationText: 'quoted text',
        annotationColor: '#ffd400',
        annotationPosition: { pageIndex: 3 },
        annotationSortIndex: '00003|0|0',
      },
    ],
  };

  function makeAnnotatingClient(
    attachmentsImpl?: jest.Mock,
    bibliographyImpl: () => Promise<string> = () => Promise.resolve(CSL),
  ) {
    const fetchAttachmentsForCitekeys =
      attachmentsImpl ??
      jest.fn((citekeys: string[]) =>
        Promise.resolve({
          attachmentsByCitekey: new Map(
            citekeys
              .filter((k) => k === 'smith2023')
              .map((k) => [k, [RAW_ATTACHMENT]]),
          ),
          errors: [],
        }),
      );
    return {
      client: {
        fetchBibliography: jest.fn(bibliographyImpl),
        fetchAttachmentsForCitekeys,
        ping: jest.fn(),
      } as never,
      fetchAttachmentsForCitekeys,
    };
  }

  it('attaches normalized annotations and attachments to matching entries', async () => {
    const { client } = makeAnnotatingClient();
    const source = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      undefined,
      undefined,
      undefined,
      true,
    );

    const result = await source.load();

    const smith = result.entries.find((e) => e.id === 'smith2023')!;
    expect(smith.annotations).toHaveLength(1);
    expect(smith.annotations[0].text).toBe('quoted text');
    expect(smith.annotations[0].colorName).toBe('yellow');
    expect(smith.annotations[0].page).toBe(4);
    expect(smith.annotations[0].openURI).toBe(
      'zotero://open-pdf/library/items/ATTKEY01?page=4&annotation=ANNOT001',
    );
    expect(smith.attachments).toHaveLength(1);
    expect(smith.attachments[0].id).toBe('ATTKEY01');

    // Uniform interface: an entry with no annotations yields [] (not
    // undefined), so templates iterate/guard without special-casing.
    const doe = result.entries.find((e) => e.id === 'doe2024')!;
    expect(doe.annotations).toEqual([]);
    expect(doe.attachments).toEqual([]);
  });

  it('exposes annotations through the template context', async () => {
    const { client } = makeAnnotatingClient();
    const source = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      undefined,
      undefined,
      undefined,
      true,
    );

    const result = await source.load();
    const smith = result.entries.find((e) => e.id === 'smith2023')!;
    const context = smith.toTemplateContext();

    expect(context.annotationCount).toBe(1);
    expect(context.annotations![0].comment).toBe('');
    const doeContext = result.entries
      .find((e) => e.id === 'doe2024')!
      .toTemplateContext();
    expect(doeContext.annotationCount).toBe(0);
  });

  it('reuses cached attachments when the export is unchanged', async () => {
    // Periodic polls with an unchanged library must not re-fetch every
    // entry's attachments via JSON-RPC on each cycle.
    const { client, fetchAttachmentsForCitekeys } = makeAnnotatingClient();
    const { fs } = createMockFileSystem(
      JSON.stringify({
        version: 2,
        format: DATABASE_FORMATS.CslJson,
        raw: CSL,
        attachments: { smith2023: [RAW_ATTACHMENT] },
      }),
    );
    const source = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
      undefined,
      true,
    );

    const result = await source.load();

    expect(fetchAttachmentsForCitekeys).not.toHaveBeenCalled();
    const smith = result.entries.find((e) => e.id === 'smith2023')!;
    expect(smith.annotations).toHaveLength(1);
  });

  it('does not fetch attachments when the flag is off', async () => {
    const { client, fetchAttachmentsForCitekeys } = makeAnnotatingClient();
    const source = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
    );

    await source.load();

    expect(fetchAttachmentsForCitekeys).not.toHaveBeenCalled();
  });

  it('degrades to a load warning when the annotation fetch fails', async () => {
    const failing = jest.fn(() =>
      Promise.reject(new ZoteroApiError('JSON-RPC broke')),
    );
    const { client } = makeAnnotatingClient(failing);
    const source = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      undefined,
      undefined,
      undefined,
      true,
    );

    const result = await source.load();

    expect(result.entries).toHaveLength(2);
    expect(result.parseErrors).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('PDF annotations unavailable'),
      }),
    ]);
  });

  it('caches attachments and re-attaches them on offline fallback', async () => {
    const { fs } = createMockFileSystem();
    const { client } = makeAnnotatingClient();
    const online = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
      undefined,
      true,
    );
    await online.load();

    const offlineClient = {
      fetchBibliography: jest.fn(() =>
        Promise.reject(new ZoteroApiError('Zotero closed')),
      ),
      fetchAttachmentsForCitekeys: jest.fn(),
      ping: jest.fn(),
    } as never;
    const offline = new ZoteroSource(
      'z1',
      offlineClient,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
      undefined,
      true,
    );

    const result = await offline.load();

    const smith = result.entries.find((e) => e.id === 'smith2023')!;
    expect(smith.annotations).toHaveLength(1);
    expect(smith.annotations[0].openURI).toContain('ATTKEY01');
    expect(result.parseErrors![0].message).toContain('using cache');
  });

  it('accepts a V1 cache without annotations on offline fallback', async () => {
    const v1 = JSON.stringify({ version: 1, format: 'csl-json', raw: CSL });
    const { fs } = createMockFileSystem(v1);
    const offlineClient = {
      fetchBibliography: jest.fn(() =>
        Promise.reject(new ZoteroApiError('Zotero closed')),
      ),
      fetchAttachmentsForCitekeys: jest.fn(),
      ping: jest.fn(),
    } as never;
    const source = new ZoteroSource(
      'z1',
      offlineClient,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
      undefined,
      true,
    );

    const result = await source.load();

    expect(result.entries).toHaveLength(2);
    expect(
      result.entries.find((e) => e.id === 'smith2023')!.annotations,
    ).toEqual([]);
  });

  it('writes a V2 cache including the attachments payload', async () => {
    const { fs, written } = createMockFileSystem();
    const { client } = makeAnnotatingClient();
    const source = new ZoteroSource(
      'z1',
      client,
      createMockWorkerManager() as never,
      DATABASE_FORMATS.CslJson,
      false,
      fs,
      '/cache/zotero.json',
      undefined,
      true,
    );

    await source.load();

    const cache = JSON.parse(written.value!) as {
      version: number;
      attachments?: Record<string, unknown[]>;
    };
    expect(cache.version).toBe(2);
    expect(cache.attachments!.smith2023).toHaveLength(1);
  });
});
