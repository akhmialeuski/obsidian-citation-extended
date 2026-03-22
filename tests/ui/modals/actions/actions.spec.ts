/** @jest-environment jsdom */
import { InsertCitationAction } from '../../../../src/ui/modals/actions/insert-citation.action';
import { InsertNoteContentAction } from '../../../../src/ui/modals/actions/insert-note-content.action';
import { InsertNoteLinkAction } from '../../../../src/ui/modals/actions/insert-note-link.action';
import { OpenNoteAction } from '../../../../src/ui/modals/actions/open-note.action';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    MarkdownView: class {},
  }),
  { virtual: true },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock factory
function makePlugin(): any {
  return {
    editorActions: {
      insertMarkdownCitation: jest.fn(),
      insertLiteratureNoteContent: jest.fn().mockResolvedValue(undefined),
      insertLiteratureNoteLink: jest.fn().mockResolvedValue(undefined),
      openLiteratureNote: jest.fn().mockResolvedValue(undefined),
    },
    platform: {
      notifications: {
        show: jest.fn(),
      },
    },
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
  let plugin: ReturnType<typeof makePlugin>;
  let action: InsertCitationAction;

  beforeEach(() => {
    plugin = makePlugin();
    action = new InsertCitationAction(plugin);
  });

  it('has the correct name', () => {
    expect(action.name).toBe('Insert citation');
  });

  it('calls insertMarkdownCitation with isAlternative=false on Enter', () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.selectedText = 'some text';
    action.onChoose(entry as never, evt);

    expect(plugin.editorActions.insertMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      false,
      'some text',
    );
  });

  it('calls insertMarkdownCitation with isAlternative=true on Shift+Enter', () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter', shiftKey: true });

    action.onChoose(entry as never, evt);

    expect(plugin.editorActions.insertMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      true,
      undefined,
    );
  });

  it('passes isAlternative=false for MouseEvent', () => {
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    action.onChoose(entry as never, evt);

    expect(plugin.editorActions.insertMarkdownCitation).toHaveBeenCalledWith(
      'test2024',
      false,
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
  let plugin: ReturnType<typeof makePlugin>;
  let action: InsertNoteContentAction;

  beforeEach(() => {
    plugin = makePlugin();
    action = new InsertNoteContentAction(plugin);
  });

  it('has the correct name', () => {
    expect(action.name).toBe('Insert literature note content');
  });

  it('calls insertLiteratureNoteContent on onChoose', async () => {
    const entry = makeEntry();
    action.selectedText = 'selected';

    await action.onChoose(entry as never);

    expect(
      plugin.editorActions.insertLiteratureNoteContent,
    ).toHaveBeenCalledWith('test2024', 'selected');
  });

  it('calls insertLiteratureNoteContent without selectedText', async () => {
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(
      plugin.editorActions.insertLiteratureNoteContent,
    ).toHaveBeenCalledWith('test2024', undefined);
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
  let plugin: ReturnType<typeof makePlugin>;
  let action: InsertNoteLinkAction;

  beforeEach(() => {
    plugin = makePlugin();
    action = new InsertNoteLinkAction(plugin);
  });

  it('has the correct name', () => {
    expect(action.name).toBe('Insert literature note link');
  });

  it('calls insertLiteratureNoteLink on onChoose', async () => {
    const entry = makeEntry();

    await action.onChoose(entry as never);

    expect(plugin.editorActions.insertLiteratureNoteLink).toHaveBeenCalledWith(
      'test2024',
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
  let plugin: ReturnType<typeof makePlugin>;
  let action: OpenNoteAction;
  let openSpy: jest.SpyInstance;

  beforeEach(() => {
    plugin = makePlugin();
    action = new OpenNoteAction(plugin);
    (plugin.platform.notifications.show as jest.Mock).mockClear();
    // Mock global open (window.open in jsdom)
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('has the correct name', () => {
    expect(action.name).toBe('Open literature note');
  });

  it('opens literature note on Enter key', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter' });

    action.selectedText = 'selected';
    await action.onChoose(entry as never, evt);

    expect(plugin.editorActions.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      false,
      'selected',
    );
  });

  it('opens literature note in new pane on Ctrl+Enter', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Enter', ctrlKey: true });

    await action.onChoose(entry as never, evt);

    expect(plugin.editorActions.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      true,
      undefined,
    );
  });

  it('opens literature note on MouseEvent', async () => {
    const entry = makeEntry();
    const evt = new MouseEvent('click');

    await action.onChoose(entry as never, evt);

    expect(plugin.editorActions.openLiteratureNote).toHaveBeenCalledWith(
      'test2024',
      false,
      undefined,
    );
  });

  it('opens Zotero on Tab (without shift)', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Tab' });

    await action.onChoose(entry as never, evt);

    expect(openSpy).toHaveBeenCalledWith('zotero://select/items/@test2024');
    expect(plugin.editorActions.openLiteratureNote).not.toHaveBeenCalled();
  });

  it('opens PDF on Shift+Tab when files available', async () => {
    const entry = makeEntry({ files: ['/path/to/paper.pdf'] });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(openSpy).toHaveBeenCalledWith('file:///path/to/paper.pdf');
    expect(plugin.platform.notifications.show).not.toHaveBeenCalled();
  });

  it('shows Notice on Shift+Tab when no files available', async () => {
    const entry = makeEntry({ files: [] });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(plugin.platform.notifications.show).toHaveBeenCalledWith(
      'This reference has no associated PDF files.',
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('shows Notice on Shift+Tab when files is undefined', async () => {
    const entry = makeEntry({ files: undefined });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(plugin.platform.notifications.show).toHaveBeenCalledWith(
      'This reference has no associated PDF files.',
    );
  });

  it('filters only PDF files on Shift+Tab', async () => {
    const entry = makeEntry({
      files: ['/path/to/doc.txt', '/path/to/paper.PDF'],
    });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(openSpy).toHaveBeenCalledWith('file:///path/to/paper.PDF');
  });

  it('shows Notice when only non-PDF files exist', async () => {
    const entry = makeEntry({
      files: ['/path/to/doc.txt', '/path/to/notes.md'],
    });
    const evt = new KeyboardEvent('keyup', { key: 'Tab', shiftKey: true });

    await action.onChoose(entry as never, evt);

    expect(plugin.platform.notifications.show).toHaveBeenCalledWith(
      'This reference has no associated PDF files.',
    );
  });

  it('does nothing for unhandled keys', async () => {
    const entry = makeEntry();
    const evt = new KeyboardEvent('keyup', { key: 'Escape' });

    await action.onChoose(entry as never, evt);

    expect(plugin.editorActions.openLiteratureNote).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(plugin.platform.notifications.show).not.toHaveBeenCalled();
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
