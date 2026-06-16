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
    setIcon: jest.fn(),
    WorkspaceLeaf: class {},
  }),
  { virtual: true },
);

import {
  ReferencesView,
  REFERENCES_VIEW_TYPE,
} from '../../../src/ui/views/references-view';
import { LoadingStatus } from '../../../src/library/library-state';
import { createMockEntry } from '../../helpers/mock-obsidian';

// ---------------------------------------------------------------------------
// Polyfill Obsidian-specific HTMLElement helpers for jsdom
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface StoreHook {
  fire: (status: LoadingStatus) => void;
  unsubscribe: jest.Mock;
}

function makeView(opts: {
  library?: Record<string, unknown> | null;
  content?: string | null;
  renderOk?: boolean;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (view as any).app = {
    workspace: {
      on: jest.fn(() => ({})),
      getActiveViewOfType: jest.fn(() =>
        editorContent != null
          ? { editor: { getValue: () => editorContent } }
          : null,
      ),
      getActiveFile: jest.fn(() => null),
    },
    vault: { cachedRead: jest.fn() },
  };

  return { view, deps, onOpenCitekey, storeHook };
}

const contentEl = (view: ReferencesView): HTMLElement =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (view as any).contentEl as HTMLElement;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
