/** @jest-environment jsdom */
import { ContextMenuHandler } from '../../src/services/context-menu-handler';
import type { IActionRegistry } from '../../src/application/actions/action-registry';
import type { ActionContext } from '../../src/application/actions/action.types';
import type { ApplicationAction } from '../../src/application/actions/action.types';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    MarkdownView: class {},
  }),
  { virtual: true },
);

jest.mock('../../src/application/citekey-extractor', () => ({
  extractCitekeyAtCursor: jest.fn(),
}));

import { extractCitekeyAtCursor } from '../../src/application/citekey-extractor';
const mockExtractCitekey = extractCitekeyAtCursor as jest.MockedFunction<
  typeof extractCitekeyAtCursor
>;

function makeAction(
  overrides: Partial<{
    name: string;
    icon: string;
    isVisible: boolean;
    isEnabled: boolean;
    usesCitekey: boolean;
  }> = {},
): ApplicationAction {
  return {
    descriptor: {
      id: 'test-action',
      name: overrides.name ?? 'Open literature note',
      icon: overrides.icon ?? 'book-open',
      showInCommandPalette: true,
      showInContextMenu: true,
      requiresEditor: true,
      usesCitekey: overrides.usesCitekey ?? true,
    },
    isVisible: jest.fn().mockReturnValue(overrides.isVisible ?? true),
    isEnabled: jest.fn().mockReturnValue(overrides.isEnabled ?? true),
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as ApplicationAction;
}

/** Editor proxy double; `selection` is what `getSelection` returns. */
function makeEditor(selection = '') {
  return {
    getCursor: jest.fn(),
    getLine: jest.fn(),
    getSelection: jest.fn(() => selection),
  };
}

function makePlugin(
  editorProxy: unknown = null,
  actions: ApplicationAction[] = [],
): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  plugin: any;
  actionRegistry: IActionRegistry;
  actionCtx: ActionContext;
  _getMenuCallback: () => ((menu: unknown) => void) | null;
} {
  let menuCallback: ((menu: unknown) => void) | null = null;

  const plugin = {
    registerEvent: jest.fn(),
    app: {
      workspace: {
        on: jest.fn((_event: string, cb: (menu: unknown) => void) => {
          menuCallback = cb;
          return { id: 'mock-ref' };
        }),
      },
    },
  };

  const actionRegistry: IActionRegistry = {
    register: jest.fn(),
    getAll: jest.fn().mockReturnValue(actions),
    getById: jest.fn(),
    getContextMenuActions: jest.fn().mockReturnValue(actions),
    getCommandPaletteActions: jest.fn().mockReturnValue([]),
  };

  const actionCtx = {
    platform: {
      workspace: {
        getActiveEditor: jest.fn(() => editorProxy),
      },
    },
  } as unknown as ActionContext;

  return {
    plugin,
    actionRegistry,
    actionCtx,
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
  beforeEach(() => {
    mockExtractCitekey.mockReset();
  });

  it('registers editor-menu event on register()', () => {
    const { plugin, actionRegistry, actionCtx } = makePlugin();
    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    expect(plugin.registerEvent).toHaveBeenCalled();
    expect(plugin.app.workspace.on).toHaveBeenCalledWith(
      'editor-menu',
      expect.any(Function),
    );
  });

  it('adds menu item when cursor is on a citation', () => {
    const editor = makeEditor();
    const action = makeAction({ name: 'Open literature note' });
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      editor,
      [action],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    expect(menu.addItem).toHaveBeenCalled();
    expect(menu._items).toHaveLength(1);
    expect(menu._items[0].title).toBe('Open literature note @smith2023');
    expect(menu._items[0].icon).toBe('book-open');
  });

  it('clicking menu item calls action.execute', () => {
    const editor = makeEditor();
    const action = makeAction();
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      editor,
      [action],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    menu._items[0].onClick();
    expect(action.execute).toHaveBeenCalledWith({
      citekey: 'smith2023',
      selectedText: '',
    });
  });

  it('does not add menu item when no editor is active', () => {
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      null,
      [makeAction()],
    );

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('does not add menu item when no citation at cursor', () => {
    const editor = makeEditor();
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      editor,
      [makeAction()],
    );
    mockExtractCitekey.mockReturnValue(null);

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('adds multiple menu items for multiple context menu actions', () => {
    const editor = makeEditor();
    const action1 = makeAction({ name: 'Open note' });
    const action2 = makeAction({ name: 'Insert citation' });
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      editor,
      [action1, action2],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    expect(menu._items).toHaveLength(2);
    expect(menu._items[0].title).toBe('Open note @smith2023');
    expect(menu._items[1].title).toBe('Insert citation @smith2023');
  });

  it('skips actions that are not visible', () => {
    const editor = makeEditor();
    const action = makeAction({ isVisible: false });
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      editor,
      [action],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('skips actions that are not enabled', () => {
    const editor = makeEditor();
    const action = makeAction({ isEnabled: false });
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      editor,
      [action],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    const handler = new ContextMenuHandler(plugin, actionRegistry, actionCtx);
    handler.register();

    const menuCallback = _getMenuCallback();
    const menu = makeMockMenu();
    menuCallback!(menu);

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('adds items without a citekey suffix when only text is selected', () => {
    const action = makeAction({
      name: 'Insert or replace with template output',
      usesCitekey: false,
    });
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      makeEditor('PDF: [PDF](zotero://open-pdf/library/items/KEY)'),
      [action],
    );
    mockExtractCitekey.mockReturnValue(null);

    new ContextMenuHandler(plugin, actionRegistry, actionCtx).register();
    const menu = makeMockMenu();
    _getMenuCallback()!(menu);

    expect(menu._items.map((item) => item.title)).toEqual([
      'Insert or replace with template output',
    ]);
    menu._items[0].onClick();
    expect(action.isVisible).toHaveBeenCalledWith({
      citekey: undefined,
      selectedText: 'PDF: [PDF](zotero://open-pdf/library/items/KEY)',
    });
    expect(action.execute).toHaveBeenCalledWith({
      citekey: undefined,
      selectedText: 'PDF: [PDF](zotero://open-pdf/library/items/KEY)',
    });
  });

  it('passes both the citekey and the selection when both are present', () => {
    const action = makeAction();
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      makeEditor('selected'),
      [action],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    new ContextMenuHandler(plugin, actionRegistry, actionCtx).register();
    const menu = makeMockMenu();
    _getMenuCallback()!(menu);

    expect(menu._items[0].title).toBe('Open literature note @smith2023');
    expect(action.isVisible).toHaveBeenCalledWith({
      citekey: 'smith2023',
      selectedText: 'selected',
    });
  });
  // An action that renders the note's own entry must not name the citekey
  // under the cursor, which may belong to a different entry.
  it('does not name the citekey for an action that does not use it', () => {
    const action = makeAction({
      name: 'Insert or replace with template output',
      usesCitekey: false,
    });
    const { plugin, actionRegistry, actionCtx, _getMenuCallback } = makePlugin(
      makeEditor('selected'),
      [action],
    );
    mockExtractCitekey.mockReturnValue('smith2023');

    new ContextMenuHandler(plugin, actionRegistry, actionCtx).register();
    const menu = makeMockMenu();
    _getMenuCallback()!(menu);

    expect(menu._items[0].title).toBe('Insert or replace with template output');
  });
});
