import { BatchNoteOrchestrator } from '../../../src/notes/batch/batch-note-orchestrator';
import type { IBatchNoteOrchestrator } from '../../../src/notes/batch';
import type {
  ILibraryService,
  INoteService,
  ITemplateService,
} from '../../../src/container';
import type {
  IVaultAccess,
  IVaultFile,
} from '../../../src/platform/platform-adapter';
import type { Library } from '../../../src/core';

jest.mock('obsidian', () => ({}), { virtual: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(path: string): IVaultFile {
  return { path, name: path.split('/').pop()! };
}

function makeLibrary(entries: Record<string, object> = {}): Library {
  return { entries } as unknown as Library;
}

function makeLibraryService(library: Library | null): ILibraryService {
  return { library } as unknown as ILibraryService;
}

function makeNoteService(
  files: Record<string, IVaultFile | null>,
): INoteService {
  return {
    findExistingLiteratureNoteFile: jest
      .fn()
      .mockImplementation((citekey: string) => files[citekey] ?? null),
  } as unknown as INoteService;
}

function makeTemplateService(
  renderFn: (
    templateStr: string,
  ) => { ok: true; value: string } | { ok: false; error: Error },
): ITemplateService {
  return {
    getTemplateVariables: jest.fn().mockReturnValue({}),
    render: jest.fn().mockImplementation(renderFn),
  } as unknown as ITemplateService;
}

function makeVault(
  contents: Record<string, string>,
  modifyMock = jest.fn().mockResolvedValue(undefined),
): IVaultAccess {
  return {
    read: jest
      .fn()
      .mockImplementation((file: IVaultFile) =>
        Promise.resolve(contents[file.path] ?? ''),
      ),
    modify: modifyMock,
  } as unknown as IVaultAccess;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchNoteOrchestrator', () => {
  let orchestrator: IBatchNoteOrchestrator;

  describe('preview()', () => {
    it('returns empty result when library is null', async () => {
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(null),
        makeNoteService({}),
        makeTemplateService(() => ({ ok: true, value: '' })),
        makeVault({}),
      );

      const result = await orchestrator.preview({
        citekeys: ['*'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(result).toEqual({ updated: [], skipped: [], errors: [] });
    });

    it('skips citekeys not in library', async () => {
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ existing: { title: 'X' } })),
        makeNoteService({ existing: makeFile('notes/existing.md') }),
        makeTemplateService(() => ({ ok: true, value: 'new content' })),
        makeVault({ 'notes/existing.md': 'old content' }),
      );

      const result = await orchestrator.preview({
        citekeys: ['existing', 'missing'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(result.skipped).toContain('missing');
      expect(result.updated).toContain('existing');
    });

    it('skips citekeys with no existing note file', async () => {
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: null }),
        makeTemplateService(() => ({ ok: true, value: 'new content' })),
        makeVault({}),
      );

      const result = await orchestrator.preview({
        citekeys: ['key1'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(result.skipped).toContain('key1');
      expect(result.updated).toHaveLength(0);
    });

    it('skips note when rendered content matches current', async () => {
      const content = 'identical content';
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('notes/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: content })),
        makeVault({ 'notes/key1.md': content }),
      );

      const result = await orchestrator.preview({
        citekeys: ['key1'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(result.skipped).toContain('key1');
      expect(result.updated).toHaveLength(0);
    });

    it('marks note as updated when content would change', async () => {
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('notes/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: 'new content' })),
        makeVault({ 'notes/key1.md': 'old content' }),
      );

      const result = await orchestrator.preview({
        citekeys: ['key1'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(result.updated).toContain('key1');
    });

    it('does NOT call vault.modify in preview mode', async () => {
      const modifyMock = jest.fn();
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('notes/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: 'new content' })),
        makeVault({ 'notes/key1.md': 'old content' }, modifyMock),
      );

      await orchestrator.preview({
        citekeys: ['key1'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(modifyMock).not.toHaveBeenCalled();
    });

    it('records template render errors', async () => {
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('notes/key1.md') }),
        makeTemplateService(() => ({
          ok: false,
          error: new Error('template syntax error'),
        })),
        makeVault({ 'notes/key1.md': 'old' }),
      );

      const result = await orchestrator.preview({
        citekeys: ['key1'],
        templateStr: '{{#broken',
        dryRun: true,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].citekey).toBe('key1');
      expect(result.errors[0].error).toContain('template syntax error');
    });
  });

  describe('execute()', () => {
    it('calls vault.modify for changed notes', async () => {
      const modifyMock = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('notes/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: 'new content' })),
        makeVault({ 'notes/key1.md': 'old content' }, modifyMock),
      );

      const result = await orchestrator.execute({
        citekeys: ['key1'],
        templateStr: '{{title}}',
        dryRun: false,
      });

      expect(modifyMock).toHaveBeenCalledTimes(1);
      const [calledFile, calledContent] = modifyMock.mock.calls[0] as [
        IVaultFile,
        string,
      ];
      expect(calledFile.path).toBe('notes/key1.md');
      expect(calledContent).toBe('new content');
      expect(result.updated).toContain('key1');
    });

    it('does NOT call vault.modify when dryRun=true', async () => {
      const modifyMock = jest.fn();
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('notes/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: 'new content' })),
        makeVault({ 'notes/key1.md': 'old content' }, modifyMock),
      );

      await orchestrator.execute({
        citekeys: ['key1'],
        templateStr: '{{title}}',
        dryRun: true,
      });

      expect(modifyMock).not.toHaveBeenCalled();
    });

    it('uses wildcard to expand to all library entries', async () => {
      const modifyMock = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ k1: {}, k2: {}, k3: {} })),
        makeNoteService({
          k1: makeFile('notes/k1.md'),
          k2: makeFile('notes/k2.md'),
          k3: makeFile('notes/k3.md'),
        }),
        makeTemplateService(() => ({ ok: true, value: 'new' })),
        makeVault(
          { 'notes/k1.md': 'old', 'notes/k2.md': 'old', 'notes/k3.md': 'old' },
          modifyMock,
        ),
      );

      const result = await orchestrator.execute({
        citekeys: ['*'],
        templateStr: '{{title}}',
        dryRun: false,
      });

      expect(result.updated).toHaveLength(3);
      expect(modifyMock).toHaveBeenCalledTimes(3);
    });

    it('reports progress via callback', async () => {
      const progressCalls: Array<{ current: number; total: number }> = [];
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ k1: {}, k2: {} })),
        makeNoteService({
          k1: makeFile('notes/k1.md'),
          k2: makeFile('notes/k2.md'),
        }),
        makeTemplateService(() => ({ ok: true, value: 'new' })),
        makeVault({ 'notes/k1.md': 'old', 'notes/k2.md': 'old' }),
      );

      await orchestrator.execute(
        { citekeys: ['k1', 'k2'], templateStr: '{{t}}', dryRun: false },
        (p) => progressCalls.push({ current: p.current, total: p.total }),
      );

      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toEqual({ current: 1, total: 2 });
      expect(progressCalls[1]).toEqual({ current: 2, total: 2 });
    });

    it('collects vault.modify errors without aborting', async () => {
      const modifyMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValue(undefined);

      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ k1: {}, k2: {} })),
        makeNoteService({
          k1: makeFile('notes/k1.md'),
          k2: makeFile('notes/k2.md'),
        }),
        makeTemplateService(() => ({ ok: true, value: 'new' })),
        makeVault({ 'notes/k1.md': 'old', 'notes/k2.md': 'old' }, modifyMock),
      );

      const result = await orchestrator.execute({
        citekeys: ['k1', 'k2'],
        templateStr: '{{title}}',
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].citekey).toBe('k1');
      expect(result.updated).toContain('k2');
    });
  });
});
