/** @jest-environment jsdom */
import { InsertCitationAction } from '../../../../src/application/actions/insert-citation.action';
import { InsertSubsequentCitationAction } from '../../../../src/application/actions/insert-subsequent-citation.action';
import { InsertMultiCitationAction } from '../../../../src/application/actions/insert-multi-citation.action';
import { InsertNoteContentAction } from '../../../../src/application/actions/insert-note-content.action';
import { InsertNoteLinkAction } from '../../../../src/application/actions/insert-note-link.action';
import { OpenNoteAction } from '../../../../src/application/actions/open-note.action';
import { ActionContext } from '../../../../src/application/actions/action.types';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    MarkdownView: class {},
  }),
  { virtual: true },
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
