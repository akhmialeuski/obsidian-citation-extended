/** @jest-environment jsdom */
jest.mock(
  'obsidian',
  () => ({
    ItemView: class {
      leaf: unknown;
      app: unknown;
      contentEl: HTMLElement;
      constructor(leaf: unknown) {
        this.leaf = leaf;
        this.contentEl = document.createElement('div');
      }
      registerEvent(): void {}
    },
    MarkdownView: class {},
    Notice: jest.fn(),
    Platform: { isMacOS: false },
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
    WorkspaceLeaf: class {},
  }),
  { virtual: true },
);

import { Notice, Platform, setTooltip } from 'obsidian';
import {
  ReferencesView,
  REFERENCES_VIEW_TYPE,
} from '../../../src/ui/views/references-view';
import { LoadingStatus } from '../../../src/library/library-state';
import { createMockEntry } from '../../helpers/mock-obsidian';

// Polyfill Obsidian-specific HTMLElement helpers for jsdom
beforeAll(() => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const proto = HTMLElement.prototype as any;
  if (!proto.empty) {
    proto.empty = function (this: HTMLElement) {
      this.innerHTML = '';
    };
  }
  if (!proto.addClass) {
    proto.addClass = function (this: HTMLElement, cls: string) {
      this.classList.add(cls);
    };
  }
  if (!proto.createEl) {
    proto.createEl = function (
      this: HTMLElement,
      tag: string,
      opts?: { text?: string; cls?: string; attr?: Record<string, string> },
    ): HTMLElement {
      const el = document.createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      if (opts?.attr) {
        for (const [k, v] of Object.entries(opts.attr)) el.setAttribute(k, v);
      }
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.createDiv) {
    proto.createDiv = function (this: HTMLElement, opts?: unknown) {
      return (this as any).createEl('div', opts);
    };
  }
  if (!proto.createSpan) {
    proto.createSpan = function (this: HTMLElement, opts?: unknown) {
      return (this as any).createEl('span', opts);
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

// Harness

interface StoreHook {
  fire: (status: LoadingStatus) => void;
  unsubscribe: jest.Mock;
}

/**
 * Editor double with real offset arithmetic, so the line/ch a jump lands on is
 * checked against the document rather than against a stubbed conversion.
 */
function makeEditor(content: string) {
  return {
    getValue: () => content,
    offsetToPos: (offset: number) => {
      const before = content.slice(0, offset);
      const lastBreak = before.lastIndexOf('\n');
      return {
        line: before.split('\n').length - 1,
        ch: offset - (lastBreak + 1),
      };
    },
    setSelection: jest.fn(),
    scrollIntoView: jest.fn(),
    focus: jest.fn(),
  };
}

function makeView(opts: {
  library?: Record<string, unknown> | null;
  content?: string | null;
  renderOk?: boolean;
  /** Serve the editor via workspace.activeEditor, as when the sidebar has focus. */
  viaActiveEditor?: boolean;
  /** Give the editor no backing file, as a Canvas text node has none. */
  fileless?: boolean;
}) {
  const onOpenCitekey = jest.fn();
  const storeHook: StoreHook = { fire: () => {}, unsubscribe: jest.fn() };

  const deps = {
    libraryService: {
      get library() {
        return opts.library === undefined ? {} : opts.library;
      },
      store: {
        subscribe: jest.fn((cb: (state: { status: LoadingStatus }) => void) => {
          storeHook.fire = (status) => cb({ status });
          return storeHook.unsubscribe;
        }),
      },
    },
    templateService: {
      render: jest.fn(() =>
        opts.renderOk === false
          ? { ok: false, error: new Error('x') }
          : { ok: true, value: 'Rendered ref' },
      ),
    },
    settings: { bibliographyEntryTemplate: '{{title}}' },
    onOpenCitekey,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = new ReferencesView({} as any, deps as any);

  const editorContent = opts.content;
  const editor = editorContent != null ? makeEditor(editorContent) : null;
  // The note is read through a getter so a test can switch notes on one view
  // instance, the way the workspace does when the user opens another file.
  const note = { path: 'Note.md' };
  const file =
    opts.fileless === true
      ? null
      : {
          get path() {
            return note.path;
          },
          extension: 'md',
        };
  const fileInfo = editor ? { editor, file } : null;
  const viaActiveEditor = opts.viaActiveEditor === true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (view as any).app = {
    workspace: {
      on: jest.fn(() => ({})),
      getActiveViewOfType: jest.fn(() => (viaActiveEditor ? null : fileInfo)),
      activeEditor: viaActiveEditor ? fileInfo : null,
      // With the sidebar focused there is no active markdown VIEW, so the
      // panel renders from the file on disk — the state a jump must survive.
      getActiveFile: jest.fn(() => (viaActiveEditor ? file : null)),
    },
    vault: { cachedRead: jest.fn(() => Promise.resolve(editorContent ?? '')) },
  };

  return { view, deps, onOpenCitekey, storeHook, editor, file, note };
}

/** Dispatch a click carrying the jump modifier for the simulated platform. */
function jumpClick(el: HTMLElement | null): void {
  el?.dispatchEvent(
    new MouseEvent(
      'click',
      Platform.isMacOS ? { metaKey: true } : { ctrlKey: true },
    ),
  );
}

const items = (view: ReferencesView): HTMLElement[] =>
  Array.from(
    contentEl(view).querySelectorAll<HTMLElement>(
      '.citation-extended-ref-item',
    ),
  );

const contentEl = (view: ReferencesView): HTMLElement =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (view as any).contentEl as HTMLElement;

// Tests

describe('ReferencesView', () => {
  it('exposes the view type, display text, and icon', () => {
    const { view } = makeView({});
    expect(view.getViewType()).toBe(REFERENCES_VIEW_TYPE);
    expect(view.getDisplayText()).toBe('References');
    expect(typeof view.getIcon()).toBe('string');
  });

  it('shows a message when the library is not loaded', async () => {
    const { view } = makeView({ library: null });
    await view.onOpen();
    expect(contentEl(view).textContent).toMatch(/not loaded/i);
  });

  it('shows a message when there is no active markdown note', async () => {
    const { view } = makeView({ library: {}, content: null });
    await view.onOpen();
    expect(contentEl(view).textContent).toMatch(/Open a note/i);
  });

  it('shows a message when the note has no citations', async () => {
    const { view } = makeView({ library: {}, content: 'plain prose' });
    await view.onOpen();
    expect(contentEl(view).textContent).toMatch(/No citations/i);
  });

  it('renders one item per cited reference in document order', async () => {
    const entries = {
      a: createMockEntry({ id: 'a', title: 'Aye' }),
      b: createMockEntry({ id: 'b', title: 'Bee' }),
    };
    const { view } = makeView({
      library: { entries },
      content: 'see [@a] and @b',
    });
    await view.onOpen();
    const el = contentEl(view);
    expect(el.querySelector('.citation-extended-ref-count')?.textContent).toBe(
      '2 references',
    );
    expect(el.querySelectorAll('.citation-extended-ref-item')).toHaveLength(2);
  });

  it('marks citekeys that are not in the library as missing', async () => {
    const { view } = makeView({
      library: { entries: {} },
      content: 'see [@ghost]',
    });
    await view.onOpen();
    const item = contentEl(view).querySelector('.citation-extended-ref-item');
    expect(item?.className).toContain('is-missing');
    expect(contentEl(view).textContent).toMatch(/not in library/);
  });

  it('offers both gestures through an Obsidian tooltip on every item', async () => {
    const entries = { a: createMockEntry({ id: 'a', title: 'Aye' }) };
    const { view } = makeView({
      library: { entries },
      content: '[@a] and [@ghost]',
    });
    await view.onOpen();

    const [found, missing] = items(view);
    const tooltip = setTooltip as jest.Mock;
    expect(tooltip).toHaveBeenCalledWith(
      found,
      'Click to open the literature note, Ctrl-click to find this citation in the note',
    );
    expect(tooltip).toHaveBeenCalledWith(
      missing,
      'Ctrl-click to find this citation in the note',
    );
  });

  it('opens the literature note when a found item is clicked', async () => {
    const entries = { a: createMockEntry({ id: 'a', title: 'Aye' }) };
    const { view, onOpenCitekey } = makeView({
      library: { entries },
      content: '[@a]',
    });
    await view.onOpen();
    const item = contentEl(view).querySelector<HTMLElement>(
      '.citation-extended-ref-item',
    );
    item?.dispatchEvent(new MouseEvent('click'));
    expect(onOpenCitekey).toHaveBeenCalledWith('a');
  });

  it('only refreshes from the store on a Success transition', async () => {
    const entries = { a: createMockEntry({ id: 'a' }) };
    const { view, storeHook } = makeView({
      library: { entries },
      content: '[@a]',
    });
    await view.onOpen();
    const renderSpy = jest.spyOn(
      view as unknown as { refresh: () => Promise<void> },
      'refresh',
    );

    storeHook.fire(LoadingStatus.Loading);
    expect(renderSpy).not.toHaveBeenCalled();

    storeHook.fire(LoadingStatus.Success);
    // Debounced — flush the timer.
    await new Promise((r) => setTimeout(r, 600));
    expect(renderSpy).toHaveBeenCalled();
  });

  it('copies the rendered bibliography to the clipboard', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const entries = { a: createMockEntry({ id: 'a', title: 'Aye' }) };
    const { view } = makeView({ library: { entries }, content: '[@a]' });
    await view.onOpen();

    const copyBtn = contentEl(view).querySelector<HTMLElement>(
      '.citation-extended-ref-copy',
    );
    copyBtn?.dispatchEvent(new MouseEvent('click'));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('Rendered ref');
  });

  describe('modifier-click jumps to the citation in the note (#88)', () => {
    const entries = {
      a: createMockEntry({ id: 'a', title: 'Aye' }),
      b: createMockEntry({ id: 'b', title: 'Bee' }),
    };

    beforeEach(() => {
      (Platform as { isMacOS: boolean }).isMacOS = false;
      (Notice as unknown as jest.Mock).mockClear();
    });

    it('selects the occurrence, scrolls to it, and focuses the editor', async () => {
      const content = 'Intro.\nAs shown in [@a] this holds.';
      const { view, editor, onOpenCitekey } = makeView({
        library: { entries },
        content,
      });
      await view.onOpen();

      jumpClick(items(view)[0]);

      const at = content.indexOf('@a');
      expect(editor!.setSelection).toHaveBeenCalledWith(
        { line: 1, ch: at - content.indexOf('\n') - 1 },
        { line: 1, ch: at - content.indexOf('\n') + 1 },
      );
      expect(editor!.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.anything(),
          to: expect.anything(),
        }),
        true,
      );
      expect(editor!.focus).toHaveBeenCalled();
      // The jump replaces the open action; it does not also open the note.
      expect(onOpenCitekey).not.toHaveBeenCalled();
    });

    it('leaves a plain click opening the literature note', async () => {
      const { view, editor, onOpenCitekey } = makeView({
        library: { entries },
        content: '[@a]',
      });
      await view.onOpen();

      items(view)[0].dispatchEvent(new MouseEvent('click'));

      expect(onOpenCitekey).toHaveBeenCalledWith('a');
      expect(editor!.setSelection).not.toHaveBeenCalled();
    });

    it('uses Cmd on macOS and ignores Ctrl there', async () => {
      (Platform as { isMacOS: boolean }).isMacOS = true;
      const { view, editor, onOpenCitekey } = makeView({
        library: { entries },
        content: '[@a]',
      });
      await view.onOpen();

      // Ctrl-click on macOS is a right-click, never the jump gesture.
      items(view)[0].dispatchEvent(new MouseEvent('click', { ctrlKey: true }));
      expect(editor!.setSelection).not.toHaveBeenCalled();
      expect(onOpenCitekey).toHaveBeenCalledWith('a');

      items(view)[0].dispatchEvent(new MouseEvent('click', { metaKey: true }));
      expect(editor!.setSelection).toHaveBeenCalled();
    });

    it('ignores Cmd off macOS', async () => {
      const { view, editor, onOpenCitekey } = makeView({
        library: { entries },
        content: '[@a]',
      });
      await view.onOpen();

      items(view)[0].dispatchEvent(new MouseEvent('click', { metaKey: true }));

      expect(editor!.setSelection).not.toHaveBeenCalled();
      expect(onOpenCitekey).toHaveBeenCalledWith('a');
    });

    it('advances through every occurrence and wraps around', async () => {
      const content = '[@a] then @a again and finally [[@a]].';
      const { view, editor } = makeView({ library: { entries }, content });
      await view.onOpen();

      const starts: number[] = [];
      for (let i = 0; i < 4; i++) {
        jumpClick(items(view)[0]);
        const call = editor!.setSelection.mock.calls[i];
        starts.push(call[0].ch);
      }

      const [first, second, third, wrapped] = starts;
      expect(second).toBeGreaterThan(first);
      expect(third).toBeGreaterThan(second);
      expect(wrapped).toBe(first);
    });

    it('reports the position while cycling, and stays quiet for a lone citation', async () => {
      const { view } = makeView({
        library: { entries },
        content: '[@a] and @a, plus [@b].',
      });
      await view.onOpen();
      const notice = Notice as unknown as jest.Mock;

      jumpClick(items(view)[0]);
      expect(notice).toHaveBeenCalledWith('Citation 1 of 2');
      jumpClick(items(view)[0]);
      expect(notice).toHaveBeenCalledWith('Citation 2 of 2');

      notice.mockClear();
      jumpClick(items(view)[1]);
      expect(notice).not.toHaveBeenCalled();
    });

    it('restarts the cycle when a different citation is clicked', async () => {
      const content = '[@a] then @a again. Also [@b].';
      const { view, editor } = makeView({ library: { entries }, content });
      await view.onOpen();

      jumpClick(items(view)[0]);
      jumpClick(items(view)[0]);
      jumpClick(items(view)[1]);
      jumpClick(items(view)[0]);

      const calls = editor!.setSelection.mock.calls;
      // Back on 'a' after visiting 'b': first occurrence again, not the third.
      expect(calls[3][0]).toEqual(calls[0][0]);
    });

    it('restarts the cycle when the note under the panel changes', async () => {
      // The cycle is keyed by note path precisely so that the same citekey in
      // a different note starts over instead of resuming the old position.
      const content = '[@a] then @a again, and @a once more.';
      const { view, editor, note } = makeView({
        library: { entries },
        content,
      });
      await view.onOpen();

      jumpClick(items(view)[0]);
      jumpClick(items(view)[0]);
      const calls = editor!.setSelection.mock.calls;
      expect(calls[1][0]).not.toEqual(calls[0][0]);

      note.path = 'Another note.md';
      jumpClick(items(view)[0]);

      expect(calls[2][0]).toEqual(calls[0][0]);
    });

    it('never resumes a cycle in an editor with no file to key it by', async () => {
      // Without a path there is nothing to recognize the editor by on the next
      // click, so no cycle is remembered rather than one being shared with an
      // unrelated editor.
      const { view, editor } = makeView({
        library: { entries },
        content: '[@a] then @a again, and @a once more.',
        fileless: true,
      });
      await view.onOpen();

      jumpClick(items(view)[0]);
      jumpClick(items(view)[0]);

      const calls = editor!.setSelection.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toEqual(calls[0][0]);
    });

    it('jumps to a citekey that is missing from the library', async () => {
      const { view, editor, onOpenCitekey } = makeView({
        library: { entries: {} },
        content: 'see [@ghost] here',
      });
      await view.onOpen();

      jumpClick(items(view)[0]);

      expect(editor!.setSelection).toHaveBeenCalled();
      // A missing entry still has no literature note to open.
      expect(onOpenCitekey).not.toHaveBeenCalled();
    });

    it('falls back to the last markdown editor when the sidebar has focus', async () => {
      const { view, editor } = makeView({
        library: { entries },
        content: 'text [@a] here',
        viaActiveEditor: true,
      });
      await view.onOpen();

      jumpClick(items(view)[0]);

      expect(editor!.setSelection).toHaveBeenCalled();
    });

    it('notifies when no editor is available', async () => {
      const { view } = makeView({ library: { entries }, content: '[@a]' });
      await view.onOpen();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workspace = (view as any).app.workspace;
      workspace.getActiveViewOfType = jest.fn(() => null);
      workspace.activeEditor = null;

      jumpClick(items(view)[0]);

      expect(Notice as unknown as jest.Mock).toHaveBeenCalledWith(
        expect.stringMatching(/Open a note in the editor/i),
      );
    });

    it('notifies when the citation is no longer in the note', async () => {
      const { view, editor } = makeView({
        library: { entries },
        content: '[@a]',
      });
      await view.onOpen();
      // The note changed under a stale panel.
      editor!.getValue = () => 'nothing cited here any more';

      jumpClick(items(view)[0]);

      expect(Notice as unknown as jest.Mock).toHaveBeenCalledWith(
        expect.stringMatching(/No occurrence of @a/),
      );
      expect(editor!.setSelection).not.toHaveBeenCalled();
    });
  });

  it('unsubscribes and clears the timer on close', async () => {
    const { view, storeHook } = makeView({
      library: { entries: {} },
      content: '[@a]',
    });
    await view.onOpen();
    await view.onClose();
    expect(storeHook.unsubscribe).toHaveBeenCalled();
  });
});
