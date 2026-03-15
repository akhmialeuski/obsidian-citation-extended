/** @jest-environment jsdom */
import { EditorActions } from '../../src/ui/editor-actions';
import { Notice } from 'obsidian';

jest.mock(
  'obsidian',
  () => ({
    MarkdownView: class {},
    Notice: jest.fn(),
  }),
  { virtual: true },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock factory
function makePlugin(overrides: Record<string, any> = {}): any {
  return {
    app: {
      workspace: {
        getActiveViewOfType: jest.fn(() => null),
        activeEditor: null,
      },
      vault: {},
      metadataCache: {
        fileToLinktext: jest.fn(() => 'link'),
      },
    },
    libraryService: {
      library: {
        entries: {
          key1: { id: 'key1' },
        },
      },
    },
    noteService: {
      openLiteratureNote: jest.fn().mockResolvedValue(undefined),
      getOrCreateLiteratureNoteFile: jest
        .fn()
        .mockResolvedValue({ path: 'note.md' }),
    },
    templateService: {
      getTemplateVariables: jest.fn(() => ({})),
    },
    getEntry: jest.fn(() => ({ ok: true, value: { id: 'key1' } })),
    getTitleForCitekey: jest.fn(() => ({ ok: true, value: 'Title' })),
    getInitialContentForCitekey: jest.fn(() => ({
      ok: true,
      value: 'content',
    })),
    getMarkdownCitationForCitekey: jest.fn(() => ({
      ok: true,
      value: '[@key1]',
    })),
    getAlternativeMarkdownCitationForCitekey: jest.fn(() => ({
      ok: true,
      value: '@key1',
    })),
    ...overrides,
  };
}

describe('EditorActions', () => {
  beforeEach(() => {
    (Notice as unknown as jest.Mock).mockClear();
  });

  describe('openLiteratureNote', () => {
    it('shows notice when library is null', async () => {
      const plugin = makePlugin({
        libraryService: { library: null },
      });
      const actions = new EditorActions(plugin);

      await actions.openLiteratureNote('key1', false);

      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('still loading'),
      );
    });

    it('shows notice when entry is not found', async () => {
      const plugin = makePlugin();
      plugin.getEntry = jest.fn(() => ({
        ok: false,
        error: { message: 'Entry not found: key2' },
      }));
      const actions = new EditorActions(plugin);

      await actions.openLiteratureNote('key2', false);

      expect(Notice).toHaveBeenCalledWith('Entry not found: key2');
    });

    it('calls noteService.openLiteratureNote on success', async () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);

      await actions.openLiteratureNote('key1', true);

      expect(plugin.noteService.openLiteratureNote).toHaveBeenCalledWith(
        'key1',
        plugin.libraryService.library,
        true,
      );
      expect(Notice).not.toHaveBeenCalled();
    });

    it('shows notice when noteService throws', async () => {
      const plugin = makePlugin();
      plugin.noteService.openLiteratureNote = jest
        .fn()
        .mockRejectedValue(new Error('Folder not found'));
      const actions = new EditorActions(plugin);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await actions.openLiteratureNote('key1', false);

      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('Unable to open literature note'),
      );
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('getActiveEditor fallback', () => {
    it('returns editor from MarkdownView', () => {
      const editor = { replaceRange: jest.fn(), getCursor: jest.fn() };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      actions.insertLiteratureNoteContent('key1');
      expect(Notice).not.toHaveBeenCalled();
    });

    it('falls back to workspace.activeEditor', () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      plugin.app.workspace.activeEditor = { editor };
      const actions = new EditorActions(plugin);

      actions.insertLiteratureNoteContent('key1');

      expect(editor.replaceRange).toHaveBeenCalled();
      expect(Notice).not.toHaveBeenCalled();
    });

    it('shows notice when no editor is available', () => {
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      plugin.app.workspace.activeEditor = null;
      const actions = new EditorActions(plugin);

      actions.insertLiteratureNoteContent('key1');

      expect(Notice).toHaveBeenCalledWith('No active editor found');
    });
  });

  describe('insertMarkdownCitation', () => {
    it('inserts primary citation', () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      actions.insertMarkdownCitation('key1', false);

      expect(plugin.getMarkdownCitationForCitekey).toHaveBeenCalledWith('key1');
      expect(editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
        line: 0,
        ch: 0,
      });
    });

    it('inserts alternative citation when alternative=true', () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      actions.insertMarkdownCitation('key1', true);

      expect(
        plugin.getAlternativeMarkdownCitationForCitekey,
      ).toHaveBeenCalledWith('key1');
      expect(editor.replaceRange).toHaveBeenCalledWith('@key1', {
        line: 0,
        ch: 0,
      });
    });
  });
});
