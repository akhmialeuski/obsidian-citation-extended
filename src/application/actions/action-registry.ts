import type { ApplicationAction } from './action.types';

/**
 * Central registry of all plugin actions.
 *
 * Serves as the single source of truth that both {@link CommandRegistry}
 * and {@link ContextMenuHandler} read from to build their UI surfaces.
 * Actions are registered once during plugin init and queried by surface type.
 */
export interface IActionRegistry {
  register(action: ApplicationAction): void;
  getAll(): ApplicationAction[];
  getById(id: string): ApplicationAction | undefined;
  getContextMenuActions(): ApplicationAction[];
  getCommandPaletteActions(): ApplicationAction[];
}

export class ActionRegistry implements IActionRegistry {
  private actions: ApplicationAction[] = [];

  register(action: ApplicationAction): void {
    if (this.actions.some((a) => a.descriptor.id === action.descriptor.id)) {
      throw new Error(
        `Action with id "${action.descriptor.id}" is already registered`,
      );
    }
    this.actions.push(action);
  }

  getAll(): ApplicationAction[] {
    return [...this.actions];
  }

  getById(id: string): ApplicationAction | undefined {
    return this.actions.find((a) => a.descriptor.id === id);
  }

  getContextMenuActions(): ApplicationAction[] {
    return this.actions.filter((a) => a.descriptor.showInContextMenu);
  }

  getCommandPaletteActions(): ApplicationAction[] {
    return this.actions.filter((a) => a.descriptor.showInCommandPalette);
  }
}
