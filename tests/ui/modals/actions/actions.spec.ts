/** @jest-environment jsdom */
import { InsertCitationAction } from '../../../../src/application/actions/insert-citation.action';
import { InsertSubsequentCitationAction } from '../../../../src/application/actions/insert-subsequent-citation.action';
import { InsertMultiCitationAction } from '../../../../src/application/actions/insert-multi-citation.action';
import { InsertNoteContentAction } from '../../../../src/application/actions/insert-note-content.action';
import { InsertNoteLinkAction } from '../../../../src/application/actions/insert-note-link.action';
import { OpenNoteAction } from '../../../../src/application/actions/open-note.action';
import { OpenNoteAtCursorAction } from '../../../../src/application/actions/open-note-at-cursor.action';
import { BatchUpdateNotesAction } from '../../../../src/application/actions/batch-update.action';
import { ActionContext } from '../../../../src/application/actions/action.types';
import { LiteratureNoteNotFoundError } from '../../../../src/core/errors';
import type { IBatchNoteOrchestrator } from '../../../../src/notes/batch/batch-update.types';
import type { IContentTemplateResolver } from '../../../../src/application/content-template-resolver';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    MarkdownView: class {},
  }),
  { virtual: true },
);

jest.mock('../../../../src/application/citekey-extractor', () => ({
  extractCitekeyAtCursor: jest.fn(() => null),
}));

const { extractCitekeyAtCursor } = jest.requireMock(
  '../../../../src/application/citekey-extractor',
);

function makeMockEditor() {
  return {
    getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
    getLine: jest.fn(() => ''),
    replaceRange: jest.fn(),
    replaceSelection: jest.fn(),
    setCursor: jest.fn(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCtx(): ActionContext & { _editor: any } {
  const editor = makeMockEditor();
  return {
    citationService: {
      getEntry: jest.fn(() => ({ ok: true, value: { id: 'test2024' } })),
      getTitleForCitekey: jest.fn(() => ({ ok: true, value: 'Title' })),
      getMarkdownCitation: jest.fn((citekey: string, alt: boolean) => ({
        ok: true,
        value: alt ? `@${citekey}` : `[@${citekey}]`,
      })),
      getInitialContentForCitekey: jest.fn(() =>
        Promise.resolve({ ok: true, value: 'rendered content' }),
      ),
    },
    platform: {
      workspace: {
        getActiveEditor: jest.fn(() => editor),
        getConfig: jest.fn(() => null),
        fileToLinktext: jest.fn(() => 'link'),
        openUrl: jest.fn(),
      },
      notifications: { show: jest.fn() },
    },
    noteService: {
      openLiteratureNote: jest.fn().mockResolvedValue(undefined),
      getOrCreateLiteratureNoteFile: jest
        .fn()
        .mockResolvedValue({ path: 'note.md', name: 'note.md' }),
      findExistingLiteratureNoteFile: jest.fn(() => null),
    },
    libraryService: {
      library: { entries: { test2024: { id: 'test2024' } } },
    },
    templateService: {
      getTemplateVariables: jest.fn(() => ({})),
      render: jest.fn(() => ({ ok: true, value: '' })),
    },
    settings: {
      autoCreateNoteOnCitation: false,
      disableAutomaticNoteCreation: false,
      literatureNoteLinkDisplayTemplate: '',
    },
    _editor: editor,
  } as unknown as ActionContext & {
    _editor: ReturnType<typeof makeMockEditor>;
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test2024',
    zoteroSelectURI: 'zotero://select/items/@test2024',
    files: ['/path/to/paper.pdf'],
    ...overrides,
  };
}

describe('InsertCitationAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertCitationAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertCitationAction(ctx);
  });

  it('has the correct name', () => {
    expect(action.descriptor.name).toBe('Insert Markdown citation');
  });

  it('calls getMarkdownCitation with isAlternative=false on Enter', () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.selectedText = 'some text';
    action.onChoose(entry as never, evt);

    expect(ctx.citationService.getMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      false,
      'some text',
    );
    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('[@test2024]', {
      line: 0,
      ch: 0,
    });
  });

  it('calls getMarkdownCitation with isAlternative=true on Shift+Enter', () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter', shiftKey: true });

    action.onChoose(entry as never, evt);

    expect(ctx.citationService.getMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      true,
      undefined,
    );
    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('@test2024', {
      line: 0,
      ch: 0,
    });
  });

  it('passes isAlternative=false for MouseEvent', () => {
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    action.onChoose(entry as never, evt);

    expect(ctx.citationService.getMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      false,
      undefined,
    );
  });

  it('shows notice when no active editor', () => {
    (ctx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(null);
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No active editor found',
    );
  });

  it('auto-creates note when autoCreateNoteOnCitation is enabled', () => {
    (
      ctx.settings as { autoCreateNoteOnCitation: boolean }
    ).autoCreateNoteOnCitation = true;
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    action.onChoose(entry as never, evt);

    expect(ctx.noteService.getOrCreateLiteratureNoteFile).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
      undefined,
    );
  });

  it('returns correct instructions', () => {
    const instructions = action.getInstructions();
    expect(instructions).toHaveLength(4);
    expect(instructions[0]).toEqual({ command: '↑↓', purpose: 'to navigate' });
    expect(instructions[1]).toEqual({
      command: '↵',
      purpose: 'to insert Markdown citation',
    });
    expect(instructions[2]).toEqual({
      command: 'shift ↵',
      purpose: 'to insert secondary Markdown citation',
    });
    expect(instructions[3]).toEqual({
      command: 'esc',
      purpose: 'to dismiss',
    });
  });
});

describe('InsertNoteContentAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertNoteContentAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertNoteContentAction(ctx);
  });

  it('has the correct name', () => {
    expect(action.descriptor.name).toBe(
      'Insert literature note content in the current pane',
    );
  });

  it('calls getInitialContentForCitekey and writes to editor', async () => {
    const entry = makeEntry();
    action.selectedText = 'selected';

    await action.onChoose(entry as never);

    expect(
      ctx.citationService.getInitialContentForCitekey,
    ).toHaveBeenCalledWith('test2024', 'selected');
    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('rendered content', {
      line: 0,
      ch: 0,
    });
  });

  it('calls getInitialContentForCitekey without selectedText', async () => {
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(
      ctx.citationService.getInitialContentForCitekey,
    ).toHaveBeenCalledWith('test2024', undefined);
  });

  it('shows notice when no active editor', async () => {
    (ctx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(null);
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No active editor found',
    );
  });

  it('returns correct instructions', () => {
    const instructions = action.getInstructions();
    expect(instructions).toHaveLength(3);
    expect(instructions[0]).toEqual({ command: '↑↓', purpose: 'to navigate' });
    expect(instructions[1]).toEqual({
      command: '↵',
      purpose: 'to insert literature note content in active pane',
    });
    expect(instructions[2]).toEqual({
      command: 'esc',
      purpose: 'to dismiss',
    });
  });
});

describe('InsertNoteLinkAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertNoteLinkAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertNoteLinkAction(ctx);
  });

  it('has the correct name', () => {
    expect(action.descriptor.name).toBe('Insert literature note link');
  });

  it('calls noteService.getOrCreateLiteratureNoteFile and writes link', async () => {
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.citationService.getEntry).toHaveBeenCalledWith('test2024');
    expect(ctx.noteService.getOrCreateLiteratureNoteFile).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
    );
    expect(ctx._editor.replaceSelection).toHaveBeenCalled();
  });

  it('uses wiki-link format when useMarkdownLinks is falsy', async () => {
    const entry = makeEntry();

    await action.onChoose(entry as never);

    // With no display template and useMarkdownLinks=null, displays Title via wikilink
    expect(ctx._editor.replaceSelection).toHaveBeenCalledWith('[[link]]');
  });

  it('uses markdown link format when useMarkdownLinks is true', async () => {
    (ctx.platform.workspace.getConfig as jest.Mock).mockReturnValue(true);
    const entry = makeEntry();

    await action.onChoose(entry as never);

    // With useMarkdownLinks=true and no template, displayText = citekey
    expect(ctx._editor.replaceSelection).toHaveBeenCalledWith(
      '[test2024](link)',
    );
  });

  it('shows notice when no active editor', async () => {
    (ctx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(null);
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No active editor found',
    );
  });

  it('returns correct instructions', () => {
    const instructions = action.getInstructions();
    expect(instructions).toHaveLength(3);
    expect(instructions[0]).toEqual({ command: '↑↓', purpose: 'to navigate' });
    expect(instructions[1]).toEqual({
      command: '↵',
      purpose: 'to insert literature note reference',
    });
    expect(instructions[2]).toEqual({
      command: 'esc',
      purpose: 'to dismiss',
    });
  });
});

describe('OpenNoteAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: OpenNoteAction;
  beforeEach(() => {
    ctx = makeCtx();
    action = new OpenNoteAction(ctx);
    (ctx.platform.notifications.show as jest.Mock).mockClear();
    (ctx.platform.workspace.openUrl as jest.Mock).mockClear();
  });

  it('has the correct name', () => {
    expect(action.descriptor.name).toBe('Open literature note');
  });

  it('opens literature note on Enter key', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.selectedText = 'selected';
    await action.onChoose(entry as never, evt);

    expect(ctx.noteService.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
      false,
      'selected',
    );
  });

  it('opens literature note in new pane on Ctrl+Enter', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter', ctrlKey: true });

    await action.onChoose(entry as never, evt);

    expect(ctx.noteService.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
      true,
      undefined,
    );
  });

  it('opens literature note on MouseEvent', async () => {
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    await action.onChoose(entry as never, evt);

    expect(ctx.noteService.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
      false,
      undefined,
    );
  });

  it('opens Zotero on Tab (without shift)', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Tab' });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.workspace.openUrl).toHaveBeenCalledWith(
      'zotero://select/items/@test2024',
    );
    expect(ctx.noteService.openLiteratureNote).not.toHaveBeenCalled();
  });

  it('opens PDF on Shift+Tab when files available', async () => {
    const entry = makeEntry({ files: ['/path/to/paper.pdf'] });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.workspace.openUrl).toHaveBeenCalledWith(
      'file:///path/to/paper.pdf',
    );
    expect(ctx.platform.notifications.show).not.toHaveBeenCalled();
  });

  it('shows Notice on Shift+Tab when no files available', async () => {
    const entry = makeEntry({ files: [] });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'This reference has no associated PDF files.',
    );
    expect(ctx.platform.workspace.openUrl).not.toHaveBeenCalled();
  });

  it('shows Notice on Shift+Tab when files is undefined', async () => {
    const entry = makeEntry({ files: undefined });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'This reference has no associated PDF files.',
    );
  });

  it('filters only PDF files on Shift+Tab', async () => {
    const entry = makeEntry({
      files: ['/path/to/doc.txt', '/path/to/paper.PDF'],
    });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.workspace.openUrl).toHaveBeenCalledWith(
      'file:///path/to/paper.PDF',
    );
  });

  it('shows Notice when only non-PDF files exist', async () => {
    const entry = makeEntry({
      files: ['/path/to/doc.txt', '/path/to/notes.md'],
    });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'This reference has no associated PDF files.',
    );
  });

  it('does nothing for unhandled keys', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Escape' });

    await action.onChoose(entry as never, evt);

    expect(ctx.noteService.openLiteratureNote).not.toHaveBeenCalled();
    expect(ctx.platform.workspace.openUrl).not.toHaveBeenCalled();
    expect(ctx.platform.notifications.show).not.toHaveBeenCalled();
  });

  it('returns correct instructions', () => {
    const instructions = action.getInstructions();
    expect(instructions).toHaveLength(6);
    expect(instructions[0]).toEqual({ command: '↑↓', purpose: 'to navigate' });
    expect(instructions[1]).toEqual({
      command: '↵',
      purpose: 'to open literature note',
    });
    expect(instructions[2]).toEqual({
      command: 'ctrl ↵',
      purpose: 'to open literature note in a new pane',
    });
    expect(instructions[3]).toEqual({
      command: 'tab',
      purpose: 'open in Zotero',
    });
    expect(instructions[4]).toEqual({
      command: 'shift tab',
      purpose: 'open PDF',
    });
    expect(instructions[5]).toEqual({
      command: 'esc',
      purpose: 'to dismiss',
    });
  });
});

describe('InsertSubsequentCitationAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertSubsequentCitationAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertSubsequentCitationAction(ctx);
  });

  it('has the correct name', () => {
    expect(action.descriptor.name).toBe('Insert subsequent citation');
  });

  it('inserts citation via citationService when cursor is not inside citation block', () => {
    const entry = makeEntry();
    action.onChoose(entry as never);

    expect(ctx.citationService.getMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      false,
    );
    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('[@test2024]', {
      line: 0,
      ch: 0,
    });
  });

  it('appends to existing citation block when cursor is inside one', () => {
    ctx._editor.getCursor.mockReturnValue({ line: 0, ch: 5 });
    ctx._editor.getLine.mockReturnValue('Some [@existing] text');

    const entry = makeEntry({ id: 'newkey' });
    action.onChoose(entry as never);

    // Should insert "; @newkey" before the closing bracket
    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('; @newkey', {
      line: 0,
      ch: 15,
    });
  });

  it('shows notice when no active editor', () => {
    (ctx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(null);
    const entry = makeEntry();

    action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No active editor found',
    );
  });

  it('returns correct instructions', () => {
    const instructions = action.getInstructions();
    expect(instructions).toHaveLength(3);
    expect(instructions[0]).toEqual({ command: '↑↓', purpose: 'to navigate' });
    expect(instructions[1]).toEqual({
      command: '↵',
      purpose: 'to append citation to existing',
    });
  });
});

describe('InsertMultiCitationAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertMultiCitationAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertMultiCitationAction(ctx);
  });

  it('has the correct name', () => {
    expect(action.descriptor.name).toBe('Insert multiple citations');
  });

  it('has keepOpen=true by default', () => {
    expect(action.keepOpen).toBe(true);
  });

  it('collects citekeys on repeated onChoose calls', () => {
    const entry1 = makeEntry({ id: 'key1' });
    const entry2 = makeEntry({ id: 'key2' });
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.onChoose(entry1 as never, evt);
    action.onChoose(entry2 as never, evt);

    // Keys are collected but not yet inserted -- trigger onClose
    action.onClose();

    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('[@key1; @key2]', {
      line: 0,
      ch: 0,
    });
  });

  it('avoids duplicate citekeys', () => {
    const entry1 = makeEntry({ id: 'key1' });
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.onChoose(entry1 as never, evt);
    action.onChoose(entry1 as never, evt);

    action.onClose();

    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
      line: 0,
      ch: 0,
    });
  });

  it('inserts immediately on Shift+Enter and sets keepOpen=false', () => {
    const entry1 = makeEntry({ id: 'key1' });
    const evt = new KeyboardEvent('keyup', {
      key: 'Enter',
      shiftKey: true,
    });

    action.onChoose(entry1 as never, evt);

    expect(action.keepOpen).toBe(false);
    expect(ctx._editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
      line: 0,
      ch: 0,
    });
  });

  it('onClose is a no-op when no keys collected', () => {
    action.onClose();

    expect(ctx._editor.replaceRange).not.toHaveBeenCalled();
  });

  it('shows notice when no active editor on insert', () => {
    (ctx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(null);
    const entry1 = makeEntry({ id: 'key1' });
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.onChoose(entry1 as never, evt);
    action.onClose();

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No active editor found',
    );
  });

  it('resets keepOpen and collectedKeys after onClose (reuse across modal sessions)', () => {
    const entry1 = makeEntry({ id: 'key1' });
    const shiftEnter = new KeyboardEvent('keyup', {
      key: 'Enter',
      shiftKey: true,
    });

    // First session: Shift+Enter sets keepOpen=false
    action.onChoose(entry1 as never, shiftEnter);
    expect(action.keepOpen).toBe(false);

    // onClose resets state for next session
    action.onClose();
    expect(action.keepOpen).toBe(true);

    // Second session: keepOpen should be true again
    const entry2 = makeEntry({ id: 'key2' });
    const enter = new KeyboardEvent('keyup', { key: 'Enter' });
    action.onChoose(entry2 as never, enter);
    expect(action.keepOpen).toBe(true);
  });

  it('returns correct instructions', () => {
    const instructions = action.getInstructions();
    expect(instructions).toHaveLength(4);
    expect(instructions[2]).toEqual({
      command: 'shift ↵',
      purpose: 'to add and insert immediately',
    });
    expect(instructions[3]).toEqual({
      command: 'esc',
      purpose: 'to insert collected citations',
    });
  });
});

// ---------------------------------------------------------------------------
// OpenNoteAtCursorAction
// ---------------------------------------------------------------------------
describe('OpenNoteAtCursorAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: OpenNoteAtCursorAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new OpenNoteAtCursorAction(ctx);
    extractCitekeyAtCursor.mockReset();
  });

  it('has the correct descriptor', () => {
    expect(action.descriptor.id).toBe('open-note-at-cursor');
    expect(action.descriptor.name).toBe(
      'Open literature note for citation at cursor',
    );
    expect(action.descriptor.showInCommandPalette).toBe(true);
    expect(action.descriptor.requiresEditor).toBe(true);
  });

  it('opens literature note when citekey is found at cursor', async () => {
    extractCitekeyAtCursor.mockReturnValue('smith2023');
    (ctx.citationService.getEntry as jest.Mock).mockReturnValue({
      ok: true,
      value: { id: 'smith2023' },
    });

    await action.execute({});

    expect(ctx.noteService.openLiteratureNote).toHaveBeenCalledWith(
      'smith2023',
      ctx.libraryService.library,
      false,
    );
  });

  it('shows notification when no active editor', async () => {
    (ctx.platform.workspace.getActiveEditor as jest.Mock).mockReturnValue(null);

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No active editor found',
    );
    expect(ctx.noteService.openLiteratureNote).not.toHaveBeenCalled();
  });

  it('shows notification when no citekey at cursor', async () => {
    extractCitekeyAtCursor.mockReturnValue(null);

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'No citation found at cursor position.',
    );
    expect(ctx.noteService.openLiteratureNote).not.toHaveBeenCalled();
  });

  it('shows notification when library is not loaded', async () => {
    extractCitekeyAtCursor.mockReturnValue('smith2023');
    (ctx.libraryService as { library: null }).library = null;

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citation library is still loading. Please wait.',
    );
  });

  it('shows notification when entry is not found', async () => {
    extractCitekeyAtCursor.mockReturnValue('unknown');
    (ctx.citationService.getEntry as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('Entry not found for citekey: unknown'),
    });

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Entry not found for citekey: unknown',
    );
    expect(ctx.noteService.openLiteratureNote).not.toHaveBeenCalled();
  });

  it('shows notification when openLiteratureNote throws LiteratureNoteNotFoundError', async () => {
    extractCitekeyAtCursor.mockReturnValue('smith2023');
    (ctx.citationService.getEntry as jest.Mock).mockReturnValue({
      ok: true,
      value: { id: 'smith2023' },
    });
    (ctx.noteService.openLiteratureNote as jest.Mock).mockRejectedValue(
      new LiteratureNoteNotFoundError('smith2023'),
    );

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      expect.stringContaining('smith2023'),
    );
  });

  it('shows generic error notification when openLiteratureNote throws unexpected error', async () => {
    extractCitekeyAtCursor.mockReturnValue('smith2023');
    (ctx.citationService.getEntry as jest.Mock).mockReturnValue({
      ok: true,
      value: { id: 'smith2023' },
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (ctx.noteService.openLiteratureNote as jest.Mock).mockRejectedValue(
      new Error('disk failure'),
    );

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Unable to open literature note. Please check that the literature note folder exists.',
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// BatchUpdateNotesAction
// ---------------------------------------------------------------------------
describe('BatchUpdateNotesAction', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let orchestrator: {
    preview: jest.Mock;
    execute: jest.Mock;
  };
  let resolver: { resolve: jest.Mock };
  let action: BatchUpdateNotesAction;

  beforeEach(() => {
    ctx = makeCtx();
    orchestrator = {
      preview: jest.fn(),
      execute: jest.fn(),
    };
    resolver = { resolve: jest.fn().mockResolvedValue('{{title}}') };
    action = new BatchUpdateNotesAction(
      ctx,
      orchestrator as unknown as IBatchNoteOrchestrator,
      resolver as unknown as IContentTemplateResolver,
    );
  });

  it('has the correct descriptor', () => {
    expect(action.descriptor.id).toBe('batch-update-notes');
    expect(action.descriptor.name).toBe('Update all literature notes');
    expect(action.descriptor.icon).toBe('refresh-cw');
  });

  it('shows "up to date" when preview returns 0 changes', async () => {
    orchestrator.preview.mockResolvedValue({
      updated: [],
      skipped: [],
      errors: [],
    });

    await action.execute({});

    expect(resolver.resolve).toHaveBeenCalled();
    expect(orchestrator.preview).toHaveBeenCalled();
    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: All notes are already up to date.',
    );
    expect(orchestrator.execute).not.toHaveBeenCalled();
  });

  it('executes batch update when preview finds changes', async () => {
    orchestrator.preview.mockResolvedValue({
      updated: ['a', 'b', 'c'],
      skipped: [],
      errors: [],
    });
    orchestrator.execute.mockResolvedValue({
      updated: ['a', 'b', 'c'],
      skipped: [],
      errors: [],
    });

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: Updating 3 notes…',
    );
    expect(orchestrator.execute).toHaveBeenCalled();
    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: Batch update complete. Updated: 3',
    );
  });

  it('uses singular "note" for single change', async () => {
    orchestrator.preview.mockResolvedValue({
      updated: ['a'],
      skipped: [],
      errors: [],
    });
    orchestrator.execute.mockResolvedValue({
      updated: ['a'],
      skipped: [],
      errors: [],
    });

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: Updating 1 note…',
    );
  });

  it('reports skipped and error counts in summary', async () => {
    orchestrator.preview.mockResolvedValue({
      updated: ['a'],
      skipped: [],
      errors: [],
    });
    orchestrator.execute.mockResolvedValue({
      updated: ['a'],
      skipped: ['b'],
      errors: [{ citekey: 'c', error: 'fail' }],
    });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: Batch update complete. Updated: 1 · Skipped: 1 · Errors: 1',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Citations batch update errors:',
      expect.any(Array),
    );
    consoleSpy.mockRestore();
  });

  it('invokes progress callback during execution', async () => {
    orchestrator.preview.mockResolvedValue({
      updated: ['a'],
      skipped: [],
      errors: [],
    });
    orchestrator.execute.mockImplementation(
      async (
        _req: unknown,
        onProgress: (p: { current: number; total: number }) => void,
      ) => {
        // Simulate progress at current=10 (divisible by 10)
        onProgress({ current: 10, total: 20 });
        // Simulate progress at current=20 (equals total)
        onProgress({ current: 20, total: 20 });
        return { updated: ['a'], skipped: [], errors: [] };
      },
    );

    await action.execute({});

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: Updated 10/20 notes…',
    );
    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citations: Updated 20/20 notes…',
    );
  });

  it('skips progress notification for non-milestone steps', async () => {
    orchestrator.preview.mockResolvedValue({
      updated: ['a'],
      skipped: [],
      errors: [],
    });
    orchestrator.execute.mockImplementation(
      async (
        _req: unknown,
        onProgress: (p: { current: number; total: number }) => void,
      ) => {
        // Step 3 is not divisible by 10 and is not equal to total
        onProgress({ current: 3, total: 20 });
        return { updated: ['a'], skipped: [], errors: [] };
      },
    );

    await action.execute({});

    // The "Updated 3/20" message should NOT appear
    const showCalls = (ctx.platform.notifications.show as jest.Mock).mock.calls;
    const progressMsgs = showCalls.filter(
      (c: string[]) =>
        typeof c[0] === 'string' && c[0].includes('Updated 3/20'),
    );
    expect(progressMsgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// InsertCitationAction — additional coverage
// ---------------------------------------------------------------------------
describe('InsertCitationAction (additional)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertCitationAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertCitationAction(ctx);
  });

  it('shows notification when getMarkdownCitation returns error', () => {
    (ctx.citationService.getMarkdownCitation as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('Template error'),
    });
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Template error',
    );
    expect(ctx._editor.replaceRange).not.toHaveBeenCalled();
  });

  it('execute() is a no-op for modal-based action', async () => {
    await action.execute({});

    // No side effects expected
    expect(ctx.platform.notifications.show).not.toHaveBeenCalled();
    expect(ctx._editor.replaceRange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// InsertNoteContentAction — additional coverage
// ---------------------------------------------------------------------------
describe('InsertNoteContentAction (additional)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertNoteContentAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertNoteContentAction(ctx);
  });

  it('shows notification when getInitialContentForCitekey returns error', async () => {
    (
      ctx.citationService.getInitialContentForCitekey as jest.Mock
    ).mockResolvedValue({
      ok: false,
      error: new Error('Render failed'),
    });
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Render failed',
    );
    expect(ctx._editor.replaceRange).not.toHaveBeenCalled();
  });

  it('execute() is a no-op for modal-based action', async () => {
    await action.execute({});

    expect(ctx.platform.notifications.show).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// InsertNoteLinkAction — additional coverage
// ---------------------------------------------------------------------------
describe('InsertNoteLinkAction (additional)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertNoteLinkAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertNoteLinkAction(ctx);
  });

  it('uses existing file when disableAutomaticNoteCreation=true and file exists', async () => {
    const existingFile = { path: 'existing.md', name: 'existing.md' };
    (
      ctx.settings as { disableAutomaticNoteCreation: boolean }
    ).disableAutomaticNoteCreation = true;
    (
      ctx.noteService.findExistingLiteratureNoteFile as jest.Mock
    ).mockReturnValue(existingFile);
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.noteService.findExistingLiteratureNoteFile).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
    );
    expect(
      ctx.noteService.getOrCreateLiteratureNoteFile,
    ).not.toHaveBeenCalled();
    expect(ctx._editor.replaceSelection).toHaveBeenCalled();
  });

  it('shows notification when disableAutomaticNoteCreation=true and no file exists', async () => {
    (
      ctx.settings as { disableAutomaticNoteCreation: boolean }
    ).disableAutomaticNoteCreation = true;
    (
      ctx.noteService.findExistingLiteratureNoteFile as jest.Mock
    ).mockReturnValue(null);
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      expect.stringContaining('test2024'),
    );
    expect(ctx._editor.replaceSelection).not.toHaveBeenCalled();
  });

  it('renders display text from template when literatureNoteLinkDisplayTemplate is set', async () => {
    (
      ctx.settings as { literatureNoteLinkDisplayTemplate: string }
    ).literatureNoteLinkDisplayTemplate = '{{title}}';
    (ctx.templateService.render as jest.Mock).mockReturnValue({
      ok: true,
      value: 'Custom Title',
    });
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.templateService.getTemplateVariables).toHaveBeenCalled();
    expect(ctx.templateService.render).toHaveBeenCalledWith(
      '{{title}}',
      expect.any(Object),
    );
    // Wiki link with custom display text differs from title "Title" -> shows alias
    expect(ctx._editor.replaceSelection).toHaveBeenCalledWith(
      '[[link|Custom Title]]',
    );
  });

  it('falls back to citekey when display template render fails', async () => {
    (
      ctx.settings as { literatureNoteLinkDisplayTemplate: string }
    ).literatureNoteLinkDisplayTemplate = '{{bad}}';
    (ctx.templateService.render as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('template error'),
    });
    const entry = makeEntry();

    await action.onChoose(entry as never);

    // Fallback displayText = citekey = "test2024", which differs from title "Title"
    expect(ctx._editor.replaceSelection).toHaveBeenCalledWith(
      '[[link|test2024]]',
    );
  });

  it('uses markdown link with display template', async () => {
    (ctx.platform.workspace.getConfig as jest.Mock).mockReturnValue(true);
    (
      ctx.settings as { literatureNoteLinkDisplayTemplate: string }
    ).literatureNoteLinkDisplayTemplate = '{{title}}';
    (ctx.templateService.render as jest.Mock).mockReturnValue({
      ok: true,
      value: 'Rendered',
    });
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx._editor.replaceSelection).toHaveBeenCalledWith(
      '[Rendered](link)',
    );
  });

  it('shows notification when library is not loaded', async () => {
    (ctx.libraryService as { library: null }).library = null;
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citation library is still loading. Please wait.',
    );
  });

  it('shows notification when getEntry returns error', async () => {
    (ctx.citationService.getEntry as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('Not found'),
    });
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith('Not found');
  });

  it('shows notification when getTitleForCitekey returns error', async () => {
    (ctx.citationService.getTitleForCitekey as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('No title'),
    });
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith('No title');
    expect(ctx._editor.replaceSelection).not.toHaveBeenCalled();
  });

  it('shows notification when getOrCreateLiteratureNoteFile throws LiteratureNoteNotFoundError', async () => {
    (
      ctx.noteService.getOrCreateLiteratureNoteFile as jest.Mock
    ).mockRejectedValue(new LiteratureNoteNotFoundError('test2024'));
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      expect.stringContaining('test2024'),
    );
  });

  it('shows generic error when getOrCreateLiteratureNoteFile throws unexpected error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (
      ctx.noteService.getOrCreateLiteratureNoteFile as jest.Mock
    ).mockRejectedValue(new Error('unexpected'));
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Failed to insert literature note link',
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('execute() delegates to insertLink when citekey is provided', async () => {
    await action.execute({ citekey: 'test2024' });

    expect(ctx.citationService.getEntry).toHaveBeenCalledWith('test2024');
    expect(ctx._editor.replaceSelection).toHaveBeenCalled();
  });

  it('execute() is a no-op when no citekey is provided', async () => {
    await action.execute({});

    expect(ctx.citationService.getEntry).not.toHaveBeenCalled();
  });

  it('wiki link without alias when display text matches title', async () => {
    // No display template, useMarkdownLinks=false => displayText = titleResult.value = "Title"
    // fileToLinktext returns "link", title is "Title" => displayText === title => no alias
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(ctx._editor.replaceSelection).toHaveBeenCalledWith('[[link]]');
  });
});

// ---------------------------------------------------------------------------
// OpenNoteAction — additional coverage
// ---------------------------------------------------------------------------
describe('OpenNoteAction (additional)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: OpenNoteAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new OpenNoteAction(ctx);
    (ctx.platform.notifications.show as jest.Mock).mockClear();
  });

  it('execute() opens note for provided citekey', async () => {
    await action.execute({ citekey: 'test2024' });

    expect(ctx.noteService.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      ctx.libraryService.library,
      false,
      undefined,
    );
  });

  it('execute() is a no-op when no citekey provided', async () => {
    await action.execute({});

    expect(ctx.noteService.openLiteratureNote).not.toHaveBeenCalled();
  });

  it('shows notification when library is null', async () => {
    (ctx.libraryService as { library: null }).library = null;
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citation library is still loading. Please wait.',
    );
  });

  it('shows notification when entry not found', async () => {
    (ctx.citationService.getEntry as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('Entry not found'),
    });
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Entry not found',
    );
  });

  it('shows notification when openLiteratureNote throws LiteratureNoteNotFoundError', async () => {
    (ctx.noteService.openLiteratureNote as jest.Mock).mockRejectedValue(
      new LiteratureNoteNotFoundError('test2024'),
    );
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      expect.stringContaining('test2024'),
    );
  });

  it('shows generic error when openLiteratureNote throws unexpected error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (ctx.noteService.openLiteratureNote as jest.Mock).mockRejectedValue(
      new Error('unknown'),
    );
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    await action.onChoose(entry as never, evt);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Unable to open literature note. Please check that the literature note folder exists.',
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// InsertSubsequentCitationAction — additional coverage
// ---------------------------------------------------------------------------
describe('InsertSubsequentCitationAction (additional)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let action: InsertSubsequentCitationAction;

  beforeEach(() => {
    ctx = makeCtx();
    action = new InsertSubsequentCitationAction(ctx);
  });

  it('shows notification when getMarkdownCitation returns error (non-block path)', () => {
    (ctx.citationService.getMarkdownCitation as jest.Mock).mockReturnValue({
      ok: false,
      error: new Error('Citation format error'),
    });
    const entry = makeEntry();

    action.onChoose(entry as never);

    expect(ctx.platform.notifications.show).toHaveBeenCalledWith(
      'Citation format error',
    );
    expect(ctx._editor.replaceRange).not.toHaveBeenCalled();
  });

  it('execute() is a no-op for modal-based action', async () => {
    await action.execute({});

    expect(ctx.platform.notifications.show).not.toHaveBeenCalled();
  });
});
