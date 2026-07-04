import { BatchNoteOrchestrator } from '../../../src/notes/batch/batch-note-orchestrator';
import type {
  IBatchNoteOrchestrator,
  IUpdateReviewPresenter,
  NoteReviewItem,
  ReviewDecision,
} from '../../../src/notes/batch/batch-update.types';
import type { IBaselineStore } from '../../../src/notes/baseline-store';
import type {
  ILibraryService,
  INoteService,
  ITemplateService,
} from '../../../src/container';
import type {
  IVaultAccess,
  IVaultFile,
} from '../../../src/platform/platform-adapter';
import type { Library, NoteBaseline } from '../../../src/core';
import { buildSyncBlock } from '../../../src/core';

jest.mock('obsidian', () => ({}), { virtual: true });

// ---------------------------------------------------------------------------
// Fixtures
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

function makeBaselineStore(
  initial: Record<string, NoteBaseline> = {},
): IBaselineStore & {
  saved: Record<string, NoteBaseline>;
  flush: jest.Mock;
} {
  const saved: Record<string, NoteBaseline> = { ...initial };
  return {
    saved,
    get: jest.fn((citekey: string) => Promise.resolve(saved[citekey] ?? null)),
    set: jest.fn((citekey: string, baseline: NoteBaseline) => {
      saved[citekey] = baseline;
      return Promise.resolve();
    }),
    recordFromRender: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
}

function makePresenter(
  decisions: ReviewDecision[],
): IUpdateReviewPresenter & { items: NoteReviewItem[] } {
  const items: NoteReviewItem[] = [];
  let i = 0;
  return {
    items,
    review: jest.fn((item: NoteReviewItem) => {
      items.push(item);
      return Promise.resolve(decisions[Math.min(i++, decisions.length - 1)]);
    }),
  };
}

/** Note content: frontmatter + one sync block + user text. */
function note(year: number, userText = 'user text'): string {
  return [
    '---',
    `year: ${year}`,
    '---',
    '',
    buildSyncBlock('meta', `**Year:** ${year}`),
    '',
    userText,
  ].join('\n');
}

function baselineFor(year: number): NoteBaseline {
  return {
    frontmatter: { year: `year: ${year}` },
    blocks: { meta: buildSyncBlock('meta', `**Year:** ${year}`) },
  };
}

const REQUEST = {
  citekeys: ['key1'],
  templateStr: '{{tpl}}',
  dryRun: false,
  mode: 'sync' as const,
  confirmation: 'conflicts' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchNoteOrchestrator', () => {
  let orchestrator: IBatchNoteOrchestrator;

  it('returns libraryNotReady when the library is null', async () => {
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(null),
      makeNoteService({}),
      makeTemplateService(() => ({ ok: true, value: '' })),
      makeVault({}),
      makeBaselineStore(),
    );

    const result = await orchestrator.preview({ ...REQUEST, citekeys: ['*'] });

    expect(result).toEqual({
      updated: [],
      skipped: [],
      conflicts: [],
      errors: [],
      libraryNotReady: true,
    });
  });

  it('skips citekeys without an entry or note file', async () => {
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(makeLibrary({ key1: {}, orphan: {} })),
      makeNoteService({ key1: null }),
      makeTemplateService(() => ({ ok: true, value: note(2023) })),
      makeVault({}),
      makeBaselineStore(),
    );

    const result = await orchestrator.execute({
      ...REQUEST,
      citekeys: ['key1', 'missing', 'orphan'],
    });

    expect(result.skipped).toEqual(expect.arrayContaining(['key1', 'missing']));
    expect(result.updated).toHaveLength(0);
  });

  it('records template render errors per citekey', async () => {
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(makeLibrary({ key1: {} })),
      makeNoteService({ key1: makeFile('n/key1.md') }),
      makeTemplateService(() => ({ ok: false, error: new Error('boom') })),
      makeVault({ 'n/key1.md': note(2023) }),
      makeBaselineStore(),
    );

    const result = await orchestrator.execute(REQUEST);

    expect(result.errors).toEqual([{ citekey: 'key1', error: 'boom' }]);
  });

  it('skips notes that are already up to date', async () => {
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(makeLibrary({ key1: {} })),
      makeNoteService({ key1: makeFile('n/key1.md') }),
      makeTemplateService(() => ({ ok: true, value: note(2023) })),
      makeVault({ 'n/key1.md': note(2023) }),
      makeBaselineStore({ key1: baselineFor(2023) }),
    );

    const result = await orchestrator.execute(REQUEST);

    expect(result.skipped).toEqual(['key1']);
  });

  it('applies a clean change and persists the new baseline', async () => {
    const modify = jest.fn().mockResolvedValue(undefined);
    const store = makeBaselineStore({ key1: baselineFor(2023) });
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(makeLibrary({ key1: {} })),
      makeNoteService({ key1: makeFile('n/key1.md') }),
      makeTemplateService(() => ({ ok: true, value: note(2024) })),
      makeVault({ 'n/key1.md': note(2023, 'MY OWN NOTES') }, modify),
      store,
    );

    const result = await orchestrator.execute(REQUEST);

    expect(result.updated).toEqual(['key1']);
    expect(result.conflicts).toEqual([]);
    const written = (modify.mock.calls[0] as [IVaultFile, string])[1];
    expect(written).toContain('**Year:** 2024');
    expect(written).toContain('MY OWN NOTES');
    expect(store.saved.key1.blocks.meta).toContain('2024');
  });

  it('does not write or store baselines in dry-run', async () => {
    const modify = jest.fn();
    const store = makeBaselineStore({ key1: baselineFor(2023) });
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(makeLibrary({ key1: {} })),
      makeNoteService({ key1: makeFile('n/key1.md') }),
      makeTemplateService(() => ({ ok: true, value: note(2024) })),
      makeVault({ 'n/key1.md': note(2023) }, modify),
      store,
    );

    const result = await orchestrator.preview(REQUEST);

    expect(result.updated).toEqual(['key1']);
    expect(modify).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it('expands the wildcard and reports progress', async () => {
    const progress: number[] = [];
    orchestrator = new BatchNoteOrchestrator(
      makeLibraryService(makeLibrary({ a: {}, b: {} })),
      makeNoteService({ a: makeFile('n/a.md'), b: makeFile('n/b.md') }),
      makeTemplateService(() => ({ ok: true, value: note(2024) })),
      makeVault({ 'n/a.md': note(2023), 'n/b.md': note(2023) }),
      makeBaselineStore({ a: baselineFor(2023), b: baselineFor(2023) }),
    );

    const result = await orchestrator.execute(
      { ...REQUEST, citekeys: ['*'] },
      (p) => progress.push(p.current),
    );

    expect(result.updated).toEqual(['a', 'b']);
    expect(progress).toEqual([1, 2]);
  });

  describe('modes', () => {
    it('overwrite replaces the whole note', async () => {
      const modify = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': note(2023, 'hand-written') }, modify),
        makeBaselineStore(),
      );

      const result = await orchestrator.execute({
        ...REQUEST,
        mode: 'overwrite',
      });

      expect(result.updated).toEqual(['key1']);
      const written = (modify.mock.calls[0] as [IVaultFile, string])[1];
      expect(written).toBe(note(2024));
      expect(written).not.toContain('hand-written');
    });

    it('frontmatter mode refreshes keys but keeps the body', async () => {
      const modify = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': note(2023, 'hand-written') }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
      );

      const result = await orchestrator.execute({
        ...REQUEST,
        mode: 'frontmatter',
      });

      expect(result.updated).toEqual(['key1']);
      const written = (modify.mock.calls[0] as [IVaultFile, string])[1];
      expect(written).toContain('year: 2024');
      expect(written).toContain('**Year:** 2023');
      expect(written).toContain('hand-written');
    });
  });

  describe('conflicts and review', () => {
    /** Current note where the user rewrote the block the library also changed. */
    const conflicted = note(2023).replace('**Year:** 2023', 'MY REWRITE');

    function makeConflictedOrchestrator(
      presenter?: IUpdateReviewPresenter,
      confirmation: 'conflicts' | 'always' | 'never' = 'conflicts',
      modify = jest.fn().mockResolvedValue(undefined),
    ) {
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
      );
      return { confirmation, modify };
    }

    it('reports conflicts without writing when confirmation is "never"', async () => {
      const presenter = makePresenter(['apply']);
      const modify = jest.fn();
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute({
        ...REQUEST,
        confirmation: 'never',
      });

      expect(result.conflicts).toEqual([
        { citekey: 'key1', conflictIds: ['meta'] },
      ]);
      expect(modify).not.toHaveBeenCalled();
      expect(presenter.review).not.toHaveBeenCalled();
    });

    it('counts conflicts in preview without invoking the presenter', async () => {
      const presenter = makePresenter(['apply']);
      makeConflictedOrchestrator();
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.preview(REQUEST);

      expect(result.conflicts).toHaveLength(1);
      expect(presenter.review).not.toHaveBeenCalled();
    });

    it('writes the safe resolution when the user chooses "apply"', async () => {
      const presenter = makePresenter(['apply']);
      const modify = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute(REQUEST);

      expect(result.updated).toEqual(['key1']);
      const written = (modify.mock.calls[0] as [IVaultFile, string])[1];
      expect(written).toContain('MY REWRITE');
      expect(presenter.items[0]).toMatchObject({
        citekey: 'key1',
        conflictCount: 1,
        conflictIds: ['meta'],
      });
      expect(presenter.items[0].hunks.length).toBeGreaterThan(0);
    });

    it('writes the library version when the user chooses "take-theirs"', async () => {
      const presenter = makePresenter(['take-theirs']);
      const modify = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute(REQUEST);

      expect(result.updated).toEqual(['key1']);
      const written = (modify.mock.calls[0] as [IVaultFile, string])[1];
      expect(written).toContain('**Year:** 2024');
      expect(written).not.toContain('MY REWRITE');
    });

    it('leaves the note untouched when the user chooses "skip"', async () => {
      const presenter = makePresenter(['skip']);
      const modify = jest.fn();
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute(REQUEST);

      expect(result.conflicts).toHaveLength(1);
      expect(modify).not.toHaveBeenCalled();
    });

    it('applies the blanket decision after "apply-all"', async () => {
      const presenter = makePresenter(['apply-all']);
      const modify = jest.fn().mockResolvedValue(undefined);
      const conflictedB = conflicted;
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ a: {}, b: {} })),
        makeNoteService({ a: makeFile('n/a.md'), b: makeFile('n/b.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/a.md': conflicted, 'n/b.md': conflictedB }, modify),
        makeBaselineStore({ a: baselineFor(2023), b: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute({
        ...REQUEST,
        citekeys: ['a', 'b'],
      });

      expect(result.updated).toEqual(['a', 'b']);
      expect(presenter.review).toHaveBeenCalledTimes(1);
    });

    it('routes clean changes through review when confirmation is "always"', async () => {
      const presenter = makePresenter(['apply']);
      const modify = jest.fn().mockResolvedValue(undefined);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': note(2023) }, modify),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute({
        ...REQUEST,
        confirmation: 'always',
      });

      expect(presenter.review).toHaveBeenCalledTimes(1);
      expect(presenter.items[0].conflictCount).toBe(0);
      expect(result.updated).toEqual(['key1']);
      expect(modify).toHaveBeenCalledTimes(1);
    });

    it('previews the take-theirs resolution alongside the default', async () => {
      const presenter = makePresenter(['apply']);
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': conflicted }),
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      await orchestrator.execute(REQUEST);

      // A conflicted item must carry BOTH diffs so the modal can preview the
      // "Use library version" button too.
      const item = presenter.items[0];
      expect(item.hunks.length).toBeGreaterThan(0);
      expect(item.hunksTakeTheirs).toBeDefined();
      expect(item.hunksTakeTheirs!.length).toBeGreaterThan(0);
    });

    // --- TOCTOU: the note changes while the modal is open (regression) -------

    it('re-reads and re-plans before writing a reviewed note', async () => {
      const presenter = makePresenter(['apply']);
      const modify = jest.fn().mockResolvedValue(undefined);
      // read() returns the conflicted note first (scan), then a version the
      // user edited during review (a clean, resolvable change).
      const editedDuringReview = note(2023, 'user typed this during review');
      const read = jest
        .fn()
        .mockResolvedValueOnce(conflicted) // scan
        .mockResolvedValueOnce(editedDuringReview); // re-read before write
      const vault = {
        read,
        modify,
      } as unknown as IVaultAccess;
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        vault,
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute(REQUEST);

      // The write reflects the re-read content (user's review-time edit kept),
      // not the stale scan snapshot.
      expect(read).toHaveBeenCalledTimes(2);
      expect(result.updated).toEqual(['key1']);
      const written = (modify.mock.calls[0] as [IVaultFile, string])[1];
      expect(written).toContain('user typed this during review');
    });

    it('skips a reviewed note that gained a new conflict during review', async () => {
      const presenter = makePresenter(['apply']);
      const modify = jest.fn();
      // During review the user rewrote the block in a way that now conflicts
      // with the library change — the stale "apply" decision must not clobber it.
      const nowConflicting = note(2023).replace(
        '**Year:** 2023',
        'A BRAND NEW USER REWRITE',
      );
      const read = jest
        .fn()
        .mockResolvedValueOnce(note(2023)) // scan: clean, needs review only via 'always'
        .mockResolvedValueOnce(nowConflicting); // re-read: conflict appeared
      const vault = { read, modify } as unknown as IVaultAccess;
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        vault,
        makeBaselineStore({ key1: baselineFor(2023) }),
        presenter,
      );

      const result = await orchestrator.execute({
        ...REQUEST,
        confirmation: 'always',
      });

      expect(modify).not.toHaveBeenCalled();
      expect(result.conflicts).toEqual([
        { citekey: 'key1', conflictIds: ['meta'] },
      ]);
    });
  });

  describe('baseline flushing', () => {
    it('flushes the store exactly once after a batch that wrote', async () => {
      const store = makeBaselineStore({
        a: baselineFor(2023),
        b: baselineFor(2023),
      });
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ a: {}, b: {} })),
        makeNoteService({ a: makeFile('n/a.md'), b: makeFile('n/b.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/a.md': note(2023), 'n/b.md': note(2023) }),
        store,
      );

      await orchestrator.execute({ ...REQUEST, citekeys: ['a', 'b'] });

      expect(store.flush).toHaveBeenCalledTimes(1);
    });

    it('does not flush when nothing was written', async () => {
      const store = makeBaselineStore({ key1: baselineFor(2023) });
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2023) })),
        makeVault({ 'n/key1.md': note(2023) }),
        store,
      );

      await orchestrator.execute(REQUEST);

      expect(store.flush).not.toHaveBeenCalled();
    });

    it('does not flush in a dry-run', async () => {
      const store = makeBaselineStore({ key1: baselineFor(2023) });
      orchestrator = new BatchNoteOrchestrator(
        makeLibraryService(makeLibrary({ key1: {} })),
        makeNoteService({ key1: makeFile('n/key1.md') }),
        makeTemplateService(() => ({ ok: true, value: note(2024) })),
        makeVault({ 'n/key1.md': note(2023) }),
        store,
      );

      await orchestrator.preview(REQUEST);

      expect(store.flush).not.toHaveBeenCalled();
    });
  });
});
