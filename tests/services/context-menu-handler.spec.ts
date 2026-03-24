/** @jest-environment jsdom */
import { ContextMenuHandler } from '../../src/services/context-menu-handler';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    MarkdownView: class {},
  }),
  { virtual: true },
);

function makePlugin(
  editorProxy: unknown = null,
  citekey: string | null = null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock factory
): any {
  let menuCallback: ((menu: unknown) => void) | null = null;

  return {
    registerEvent: jest.fn(),
    app: {
      workspace: {
        on: jest.fn((_event: string, cb: (menu: unknown) => void) => {
          menuCallback = cb;
          return { id: 'mock-ref' };
        }),
      },
    },
    platform: {
      workspace: {
        getActiveEditor: jest.fn(() => editorProxy),
      },
    },
    editorActions: {
      extractCitekeyAtCursor: jest.fn(() => citekey),
      openLiteratureNote: jest.fn().mockResolvedValue(undefined),
    },
    // expose for tests
    _getMenuCallback: () => menuCallback,
  };
}

function makeMockMenu() {
  const items: { title: string; icon: string; onClick: () => void }[] = [];
  return {
    _items: items,
    addItem: jest.fn((cb: (item: unknown) => void) => {
      const item = {
        _title: '',
        _icon: '',
        _onClick: () => {},
        setTitle(t: string) {
          this._title = t;
          return this;
        },
        setIcon(i: string) {
          this._icon = i;
          return this;
        },
        onClick(fn: () => void) {
          this._onClick = fn;
          return this;
        },
      };
      cb(item);
      items.push({
        title: item._title,
        icon: item._icon,
        onClick: item._onClick,
      });
    }),
  };
}

describe('ContextMenuHandler', () => {
  it('registers editor-menu event on register()', () => {
    const plugin = makePlugin();
    const handler = new ContextMenuHandler(plugin);
    handler.register();

    expect(plugin.registerEvent).toHaveBeenCalled();
    expect(plugin.app.workspace.on).toHaveBeenCalledWith(
      'editor-menu',
      expect.any(Function),
    );
  });

  it('adds menu item when cursor is on a citation', () => {
    const editor = { getCursor: jest.fn(), getLine: jest.fn() };
    const plugin = makePlugin(editor, 'smith2023');
    const handler = new ContextMenuHandler(plugin);
    handler.register();

    const menuCallback = plugin._getMenuCallback();
    const menu = makeMockMenu();
    menuCallback(menu);

    expect(menu.addItem).toHaveBeenCalled();
    expect(menu._items).toHaveLength(1);
    expect(menu._items[0].title).toBe('Open note for @smith2023');
    expect(menu._items[0].icon).toBe('book-open');
  });

  it('clicking menu item calls openLiteratureNote', () => {
    const editor = { getCursor: jest.fn(), getLine: jest.fn() };
    const plugin = makePlugin(editor, 'smith2023');
    const handler = new ContextMenuHandler(plugin);
    handler.register();

    const menuCallback = plugin._getMenuCallback();
    const menu = makeMockMenu();
    menuCallback(menu);

    menu._items[0].onClick();
    expect(plugin.editorActions.openLiteratureNote).toHaveBeenCalledWith(
      'smith2023',
      false,
    );
  });

  it('does not add menu item when no editor is active', () => {
    const plugin = makePlugin(null, null);
    const handler = new ContextMenuHandler(plugin);
    handler.register();

    const menuCallback = plugin._getMenuCallback();
    const menu = makeMockMenu();
    menuCallback(menu);

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('does not add menu item when no citation at cursor', () => {
    const editor = { getCursor: jest.fn(), getLine: jest.fn() };
    const plugin = makePlugin(editor, null);
    const handler = new ContextMenuHandler(plugin);
    handler.register();

    const menuCallback = plugin._getMenuCallback();
    const menu = makeMockMenu();
    menuCallback(menu);

    expect(menu.addItem).not.toHaveBeenCalled();
  });
});
