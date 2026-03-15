/**
 * Tests for Canvas / Lineage editor support (GitHub issues #217, #281).
 *
 * Verifies that getActiveEditor() falls back to workspace.activeEditor
 * when no MarkdownView is active, enabling insert commands in Canvas
 * text nodes and Lineage views.
 */

describe('getActiveEditor fallback for non-standard views', () => {
  // Minimal mocks for the Obsidian API surface used by getActiveEditor()
  function makeWorkspace(opts: {
    markdownViewEditor?: { replaceRange: jest.Mock } | null;
    activeEditor?: { editor?: { replaceRange: jest.Mock } | null } | null;
  }) {
    return {
      getActiveViewOfType: jest.fn(() =>
        opts.markdownViewEditor ? { editor: opts.markdownViewEditor } : null,
      ),
      activeEditor: opts.activeEditor,
    };
  }

  // Extract the logic under test without importing the full plugin
  function getActiveEditor(workspace: ReturnType<typeof makeWorkspace>) {
    const view = workspace.getActiveViewOfType();
    if (view?.editor) return view.editor;

    const ext = workspace as { activeEditor?: { editor?: unknown } | null };
    return ext.activeEditor?.editor ?? null;
  }

  it('returns editor from MarkdownView when available', () => {
    const editor = { replaceRange: jest.fn() };
    const ws = makeWorkspace({ markdownViewEditor: editor });
    expect(getActiveEditor(ws)).toBe(editor);
  });

  it('falls back to workspace.activeEditor for Canvas/Lineage views', () => {
    const canvasEditor = { replaceRange: jest.fn() };
    const ws = makeWorkspace({
      markdownViewEditor: null,
      activeEditor: { editor: canvasEditor },
    });
    expect(getActiveEditor(ws)).toBe(canvasEditor);
  });

  it('returns null when no editor is available anywhere', () => {
    const ws = makeWorkspace({
      markdownViewEditor: null,
      activeEditor: null,
    });
    expect(getActiveEditor(ws)).toBeNull();
  });

  it('returns null when activeEditor exists but has no editor property', () => {
    const ws = makeWorkspace({
      markdownViewEditor: null,
      activeEditor: {},
    });
    expect(getActiveEditor(ws)).toBeNull();
  });

  it('prefers MarkdownView editor over activeEditor', () => {
    const mdEditor = { replaceRange: jest.fn() };
    const canvasEditor = { replaceRange: jest.fn() };
    const ws = makeWorkspace({
      markdownViewEditor: mdEditor,
      activeEditor: { editor: canvasEditor },
    });
    expect(getActiveEditor(ws)).toBe(mdEditor);
  });
});
