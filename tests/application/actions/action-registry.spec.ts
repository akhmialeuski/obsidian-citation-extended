import { ActionRegistry } from '../../../src/application/actions/action-registry';
import {
  ApplicationAction,
  SearchModalAction,
  ActionDescriptor,
  ActionContext,
  ActionInvocationContext,
} from '../../../src/application/actions/action.types';
import { Entry } from '../../../src/core';

jest.mock('obsidian', () => ({}), { virtual: true });

const mockCtx = {} as ActionContext;

class TestAction extends ApplicationAction {
  readonly descriptor: ActionDescriptor;
  constructor(
    id: string,
    ctx: ActionContext,
    opts: Partial<ActionDescriptor> = {},
  ) {
    super(ctx);
    this.descriptor = {
      id,
      name: `Test ${id}`,
      showInCommandPalette: true,
      showInContextMenu: false,
      requiresEditor: false,
      ...opts,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_inv: ActionInvocationContext): Promise<void> {}
}

class TestSearchModalAction extends SearchModalAction {
  readonly descriptor: ActionDescriptor;
  constructor(
    id: string,
    ctx: ActionContext,
    opts: Partial<ActionDescriptor> = {},
  ) {
    super(ctx);
    this.descriptor = {
      id,
      name: `Test ${id}`,
      showInCommandPalette: true,
      showInContextMenu: false,
      requiresEditor: false,
      ...opts,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChoose(_item: Entry, _evt: MouseEvent | KeyboardEvent): void {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_inv: ActionInvocationContext): Promise<void> {}
}

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  it('registers and retrieves actions', () => {
    const action = new TestAction('test-1', mockCtx);
    registry.register(action);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getById('test-1')).toBe(action);
  });

  it('throws on duplicate id', () => {
    registry.register(new TestAction('dup', mockCtx));
    expect(() => registry.register(new TestAction('dup', mockCtx))).toThrow(
      'already registered',
    );
  });

  it('returns undefined for unknown id', () => {
    expect(registry.getById('nonexistent')).toBeUndefined();
  });

  it('filters context menu actions', () => {
    registry.register(
      new TestAction('no-menu', mockCtx, { showInContextMenu: false }),
    );
    registry.register(
      new TestAction('yes-menu', mockCtx, { showInContextMenu: true }),
    );

    const ctxActions = registry.getContextMenuActions();
    expect(ctxActions).toHaveLength(1);
    expect(ctxActions[0].descriptor.id).toBe('yes-menu');
  });

  it('filters command palette actions', () => {
    registry.register(
      new TestAction('no-palette', mockCtx, { showInCommandPalette: false }),
    );
    registry.register(
      new TestAction('yes-palette', mockCtx, { showInCommandPalette: true }),
    );

    const paletteActions = registry.getCommandPaletteActions();
    expect(paletteActions).toHaveLength(1);
    expect(paletteActions[0].descriptor.id).toBe('yes-palette');
  });

  it('getAll returns a copy', () => {
    registry.register(new TestAction('a', mockCtx));
    const all = registry.getAll();
    all.pop();
    expect(registry.getAll()).toHaveLength(1);
  });

  it('works with SearchModalAction subclasses', () => {
    const modalAction = new TestSearchModalAction('modal-1', mockCtx, {
      showInContextMenu: true,
    });
    registry.register(modalAction);

    expect(registry.getById('modal-1')).toBeInstanceOf(SearchModalAction);
    expect(registry.getContextMenuActions()).toHaveLength(1);
  });
});
