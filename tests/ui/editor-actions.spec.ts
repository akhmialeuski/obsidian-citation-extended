/** @jest-environment jsdom */
import { EditorActions } from '../../src/ui/editor-actions';
import { Notice } from 'obsidian';
import { LiteratureNoteNotFoundError } from '../../src/core/errors';

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
  const { settings: settingsOverrides, ...rest } = overrides;
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
    settings: {
      autoCreateNoteOnCitation: false,
      disableAutomaticNoteCreation: false,
      ...(settingsOverrides as Record<string, unknown>),
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
      findExistingLiteratureNoteFile: jest.fn(() => null),
    },
    templateService: {
      getTemplateVariables: jest.fn(() => ({})),
    },
    getEntry: jest.fn(() => ({ ok: true, value: { id: 'key1' } })),
    getTitleForCitekey: jest.fn(() => ({ ok: true, value: 'Title' })),
    getInitialContentForCitekey: jest.fn(() =>
      Promise.resolve({
        ok: true,
        value: 'content',
      }),
    ),
    getMarkdownCitationForCitekey: jest.fn(() => ({
      ok: true,
      value: '[@key1]',
    })),
    getAlternativeMarkdownCitationForCitekey: jest.fn(() => ({
      ok: true,
      value: '@key1',
    })),
    ...rest,
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
        undefined,
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

    it('shows user-friendly notice for LiteratureNoteNotFoundError', async () => {
      const plugin = makePlugin();
      plugin.noteService.openLiteratureNote = jest
        .fn()
        .mockRejectedValue(new LiteratureNoteNotFoundError('key1'));
      const actions = new EditorActions(plugin);

      await actions.openLiteratureNote('key1', false);

      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('Automatic note creation is disabled'),
      );
    });
  });

  describe('getActiveEditor fallback', () => {
    it('returns editor from MarkdownView', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');
      expect(Notice).not.toHaveBeenCalled();
    });

    it('falls back to workspace.activeEditor', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      plugin.app.workspace.activeEditor = { editor };
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');

      expect(editor.replaceRange).toHaveBeenCalled();
      expect(Notice).not.toHaveBeenCalled();
    });

    it('shows notice when no editor is available', async () => {
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => null);
      plugin.app.workspace.activeEditor = null;
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');

      expect(Notice).toHaveBeenCalledWith('No active editor found');
    });
  });

  describe('insertLiteratureNoteLink', () => {
    it('shows notice when disableAutomaticNoteCreation is on and note does not exist', async () => {
      const editor = {
        replaceSelection: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.settings.disableAutomaticNoteCreation = true;
      plugin.noteService.findExistingLiteratureNoteFile = jest.fn(() => null);
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('Automatic note creation is disabled'),
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
    });

    it('uses existing note when disableAutomaticNoteCreation is on and note exists', async () => {
      const editor = {
        replaceSelection: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const mockFile = { path: 'notes/key1.md' };
      const plugin = makePlugin();
      plugin.settings.disableAutomaticNoteCreation = true;
      plugin.noteService.findExistingLiteratureNoteFile = jest.fn(
        () => mockFile,
      );
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      plugin.app.vault = { getConfig: jest.fn(() => false) };
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(
        plugin.noteService.getOrCreateLiteratureNoteFile,
      ).not.toHaveBeenCalled();
      expect(editor.replaceSelection).toHaveBeenCalled();
    });

    it('creates note when disableAutomaticNoteCreation is off (default)', async () => {
      const editor = {
        replaceSelection: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.settings.disableAutomaticNoteCreation = false;
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      plugin.app.vault = { getConfig: jest.fn(() => false) };
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(
        plugin.noteService.getOrCreateLiteratureNoteFile,
      ).toHaveBeenCalled();
      expect(editor.replaceSelection).toHaveBeenCalled();
    });
  });

  describe('insertMarkdownCitation', () => {
    it('inserts primary citation', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(plugin.getMarkdownCitationForCitekey).toHaveBeenCalledWith(
        'key1',
        undefined,
      );
      expect(editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
        line: 0,
        ch: 0,
      });
    });

    it('inserts alternative citation when alternative=true', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', true);

      expect(
        plugin.getAlternativeMarkdownCitationForCitekey,
      ).toHaveBeenCalledWith('key1', undefined);
      expect(editor.replaceRange).toHaveBeenCalledWith('@key1', {
        line: 0,
        ch: 0,
      });
    });

    it('creates literature note when autoCreateNoteOnCitation is enabled', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: true },
      });
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
        line: 0,
        ch: 0,
      });
      expect(
        plugin.noteService.getOrCreateLiteratureNoteFile,
      ).toHaveBeenCalledWith('key1', plugin.libraryService.library, undefined);
    });

    it('does not create literature note when autoCreateNoteOnCitation is disabled', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: false },
      });
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
        line: 0,
        ch: 0,
      });
      expect(
        plugin.noteService.getOrCreateLiteratureNoteFile,
      ).not.toHaveBeenCalled();
    });

    it('still inserts citation even if note creation fails', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: true },
      });
      plugin.noteService.getOrCreateLiteratureNoteFile = jest
        .fn()
        .mockRejectedValue(new Error('Folder missing'));
      plugin.app.workspace.getActiveViewOfType = jest.fn(() => ({ editor }));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(editor.replaceRange).toHaveBeenCalledWith('[@key1]', {
        line: 0,
        ch: 0,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to auto-create literature note:',
        expect.any(Error),
      );
      warnSpy.mockRestore();
    });
  });
});
