/** @jest-environment jsdom */
import { EditorActions } from '../../src/ui/editor-actions';
import { LiteratureNoteNotFoundError } from '../../src/core/errors';

const mockNotificationsShow = jest.fn();

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
    platform: {
      workspace: {
        getActiveEditor: jest.fn(() => null),
        openFile: jest.fn().mockResolvedValue(undefined),
        getConfig: jest.fn(() => null),
        fileToLinktext: jest.fn(() => 'link'),
      },
      notifications: {
        show: mockNotificationsShow,
      },
    },
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
        .mockResolvedValue({ path: 'note.md', name: 'note.md' }),
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
    mockNotificationsShow.mockClear();
  });

  describe('openLiteratureNote', () => {
    it('shows notice when library is null', async () => {
      const plugin = makePlugin({
        libraryService: { library: null },
      });
      const actions = new EditorActions(plugin);

      await actions.openLiteratureNote('key1', false);

      expect(mockNotificationsShow).toHaveBeenCalledWith(
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

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Entry not found: key2',
      );
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
      expect(mockNotificationsShow).not.toHaveBeenCalled();
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

      expect(mockNotificationsShow).toHaveBeenCalledWith(
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

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.stringContaining('Automatic note creation is disabled'),
      );
    });
  });

  describe('getActiveEditor fallback', () => {
    it('returns editor from platform workspace', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');
      expect(mockNotificationsShow).not.toHaveBeenCalled();
    });

    it('shows notice when no editor is available', async () => {
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => null);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'No active editor found',
      );
    });

    it('moves cursor to end of inserted content', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 1, ch: 3 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');

      // 'content' is 7 chars, starting at line:1 ch:3, so cursor at line:1 ch:10
      expect(editor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 10 });
    });
  });

  describe('insertLiteratureNoteLink', () => {
    it('shows notice when no active editor is found', async () => {
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => null);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'No active editor found',
      );
    });

    it('shows notice when library is null', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin({
        libraryService: { library: null },
      });
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.stringContaining('still loading'),
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
    });

    it('shows notice when entry is not found', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin();
      plugin.getEntry = jest.fn(() => ({
        ok: false,
        error: { message: 'Entry not found: key2' },
      }));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key2');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Entry not found: key2',
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
    });

    it('shows notice when getTitleForCitekey fails', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin();
      plugin.getTitleForCitekey = jest.fn(() => ({
        ok: false,
        error: { message: 'Template render failed' },
      }));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      plugin.platform.workspace.getConfig = jest.fn(() => false);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Template render failed',
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
    });

    it('inserts markdown link when useMarkdownLinks is true', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      plugin.platform.workspace.getConfig = jest.fn(() => true);
      plugin.platform.workspace.fileToLinktext = jest.fn(() => 'notes/key1');
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      // Display text defaults to citekey for Markdown links (#271)
      expect(editor.replaceSelection).toHaveBeenCalledWith(
        '[key1](notes/key1)',
      );
    });

    it('inserts wikilink when useMarkdownLinks is false', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      plugin.platform.workspace.getConfig = jest.fn(() => false);
      plugin.platform.workspace.fileToLinktext = jest.fn(() => 'link');
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(editor.replaceSelection).toHaveBeenCalledWith('[[link]]');
    });

    it('shows notice when getOrCreateLiteratureNoteFile throws LiteratureNoteNotFoundError', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin();
      plugin.noteService.getOrCreateLiteratureNoteFile = jest
        .fn()
        .mockRejectedValue(new LiteratureNoteNotFoundError('key1'));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.stringContaining('Automatic note creation is disabled'),
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
    });

    it('shows generic notice when getOrCreateLiteratureNoteFile throws unknown error', async () => {
      const editor = { replaceSelection: jest.fn() };
      const plugin = makePlugin();
      plugin.noteService.getOrCreateLiteratureNoteFile = jest
        .fn()
        .mockRejectedValue(new Error('Disk full'));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Failed to insert literature note link',
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to insert literature note link:',
        expect.any(Error),
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('shows notice when disableAutomaticNoteCreation is on and note does not exist', async () => {
      const editor = {
        replaceSelection: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const plugin = makePlugin();
      plugin.settings.disableAutomaticNoteCreation = true;
      plugin.noteService.findExistingLiteratureNoteFile = jest.fn(() => null);
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.stringContaining('Automatic note creation is disabled'),
      );
      expect(editor.replaceSelection).not.toHaveBeenCalled();
    });

    it('uses existing note when disableAutomaticNoteCreation is on and note exists', async () => {
      const editor = {
        replaceSelection: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      };
      const mockFile = { path: 'notes/key1.md', name: 'key1.md' };
      const plugin = makePlugin();
      plugin.settings.disableAutomaticNoteCreation = true;
      plugin.noteService.findExistingLiteratureNoteFile = jest.fn(
        () => mockFile,
      );
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      plugin.platform.workspace.getConfig = jest.fn(() => false);
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
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      plugin.platform.workspace.getConfig = jest.fn(() => false);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteLink('key1');

      expect(
        plugin.noteService.getOrCreateLiteratureNoteFile,
      ).toHaveBeenCalled();
      expect(editor.replaceSelection).toHaveBeenCalled();
    });
  });

  describe('extractCitekeyAtCursor', () => {
    function makeEditor(line: string, ch: number) {
      return {
        getCursor: jest.fn(() => ({ line: 0, ch })),
        getLine: jest.fn(() => line),
      };
    }

    it('extracts citekey from [@key] when cursor is inside', () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);
      const editor = makeEditor('See [@smith2023] for details', 8);
      expect(actions.extractCitekeyAtCursor(editor as never)).toBe('smith2023');
    });

    it('extracts citekey from standalone @key', () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);
      const editor = makeEditor('As shown by @smith2023 recently', 15);
      expect(actions.extractCitekeyAtCursor(editor as never)).toBe('smith2023');
    });

    it('extracts citekey from [[@key]]', () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);
      const editor = makeEditor('Link to [[@smith2023]] here', 14);
      expect(actions.extractCitekeyAtCursor(editor as never)).toBe('smith2023');
    });

    it('extracts citekey from [[@key|alias]]', () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);
      const editor = makeEditor('Link to [[@smith2023|Smith]] here', 14);
      expect(actions.extractCitekeyAtCursor(editor as never)).toBe('smith2023');
    });

    it('returns null when cursor is not on a citation', () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);
      const editor = makeEditor('No citations here at all', 10);
      expect(actions.extractCitekeyAtCursor(editor as never)).toBeNull();
    });

    it('handles multiple citations on the same line', () => {
      const plugin = makePlugin();
      const actions = new EditorActions(plugin);
      // Cursor at position 25 — inside second citation
      const editor = makeEditor('See [@smith2023] and [@jones2022] here', 25);
      expect(actions.extractCitekeyAtCursor(editor as never)).toBe('jones2022');
    });
  });

  describe('insertLiteratureNoteContent', () => {
    it('shows notice when content result is an error', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.getInitialContentForCitekey = jest.fn(() =>
        Promise.resolve({
          ok: false,
          error: { message: 'Template render failed' },
        }),
      );
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Template render failed',
      );
      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('handles multi-line content and positions cursor correctly', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.getInitialContentForCitekey = jest.fn(() =>
        Promise.resolve({
          ok: true,
          value: 'line1\nline2\nline3',
        }),
      );
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1');

      // 3 lines, starting at line:0 ch:0
      // newLine = 0 + 3 - 1 = 2, newCh = 'line3'.length = 5
      expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 5 });
    });

    it('passes selectedText to getInitialContentForCitekey', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertLiteratureNoteContent('key1', 'selected text');

      expect(plugin.getInitialContentForCitekey).toHaveBeenCalledWith(
        'key1',
        'selected text',
      );
    });
  });

  describe('insertMarkdownCitation', () => {
    it('shows notice when no active editor is found', async () => {
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => null);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'No active editor found',
      );
    });

    it('shows notice when citation result is an error', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.getMarkdownCitationForCitekey = jest.fn(() => ({
        ok: false,
        error: { message: 'Template render failed' },
      }));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Template render failed',
      );
      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('shows notice when alternative citation result is an error', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.getAlternativeMarkdownCitationForCitekey = jest.fn(() => ({
        ok: false,
        error: { message: 'Alternative template failed' },
      }));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', true);

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'Alternative template failed',
      );
      expect(editor.replaceRange).not.toHaveBeenCalled();
    });

    it('passes selectedText to citation methods', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false, 'my selection');

      expect(plugin.getMarkdownCitationForCitekey).toHaveBeenCalledWith(
        'key1',
        'my selection',
      );
    });

    it('handles multi-line citation and positions cursor correctly', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
        getLine: jest.fn(() => ''),
      };
      const plugin = makePlugin();
      plugin.getMarkdownCitationForCitekey = jest.fn(() => ({
        ok: true,
        value: 'line1\nline2',
      }));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      // 2 lines: newLine = 0 + 2 - 1 = 1, newCh = 'line2'.length = 5
      expect(editor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 5 });
    });

    it('does not auto-create note when library is null', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: true },
        libraryService: { library: null },
      });
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      expect(
        plugin.noteService.getOrCreateLiteratureNoteFile,
      ).not.toHaveBeenCalled();
    });

    it('inserts primary citation', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
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
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
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

    it('moves cursor to end of inserted citation text', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 2, ch: 5 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertMarkdownCitation('key1', false);

      // '[@key1]' is 7 chars, starting at ch:5, so cursor should be at ch:12
      expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 12 });
    });

    it('creates literature note when autoCreateNoteOnCitation is enabled', async () => {
      const editor = {
        replaceRange: jest.fn(),
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: true },
      });
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
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
        setCursor: jest.fn(),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: false },
      });
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
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
        setCursor: jest.fn(),
      };
      const plugin = makePlugin({
        settings: { autoCreateNoteOnCitation: true },
      });
      plugin.noteService.getOrCreateLiteratureNoteFile = jest
        .fn()
        .mockRejectedValue(new Error('Folder missing'));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);

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

  describe('insertSubsequentCitation', () => {
    it('shows notice when no active editor', async () => {
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => null);
      const actions = new EditorActions(plugin);

      await actions.insertSubsequentCitation('key2');

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'No active editor found',
      );
    });

    it('appends citekey to existing citation at cursor', async () => {
      const editor = {
        getCursor: jest.fn(() => ({ line: 0, ch: 5 })),
        getLine: jest.fn(() => 'See [@key1] for details'),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertSubsequentCitation('key2');

      // Should insert "; @key2" before the closing bracket at position 10
      expect(editor.replaceRange).toHaveBeenCalledWith('; @key2', {
        line: 0,
        ch: 10,
      });
      expect(editor.setCursor).toHaveBeenCalledWith({
        line: 0,
        ch: 17,
      });
    });

    it('falls back to normal citation when cursor is not inside a citation', async () => {
      const editor = {
        getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
        getLine: jest.fn(() => 'No citation here'),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };
      const plugin = makePlugin();
      plugin.getMarkdownCitationForCitekey = jest.fn(() => ({
        ok: true,
        value: '[@key2]',
      }));
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.insertSubsequentCitation('key2');

      // Should fall back to insertMarkdownCitation
      expect(editor.replaceRange).toHaveBeenCalledWith('[@key2]', {
        line: 0,
        ch: 0,
      });
    });
  });

  describe('openNoteAtCursor', () => {
    it('shows notice when no active editor', async () => {
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => null);
      const actions = new EditorActions(plugin);

      await actions.openNoteAtCursor();

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'No active editor found',
      );
    });

    it('shows notice when no citation at cursor', async () => {
      const editor = {
        getCursor: jest.fn(() => ({ line: 0, ch: 5 })),
        getLine: jest.fn(() => 'No citation here'),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.openNoteAtCursor();

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        'No citation found at cursor position.',
      );
    });

    it('opens literature note when citation is found at cursor', async () => {
      const editor = {
        getCursor: jest.fn(() => ({ line: 0, ch: 8 })),
        getLine: jest.fn(() => 'See [@smith2023] for details'),
      };
      const plugin = makePlugin();
      plugin.platform.workspace.getActiveEditor = jest.fn(() => editor);
      const actions = new EditorActions(plugin);

      await actions.openNoteAtCursor();

      // Should call openLiteratureNote -> noteService.openLiteratureNote
      expect(plugin.noteService.openLiteratureNote).toHaveBeenCalledWith(
        'smith2023',
        expect.anything(),
        false,
        undefined,
      );
    });
  });
});
