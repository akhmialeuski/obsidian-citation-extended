import type { ApplicationAction } from './action.types';

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
