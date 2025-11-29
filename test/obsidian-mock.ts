/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
export class Notice {
  noticeEl: HTMLElement;
  constructor(_message: string | DocumentFragment, _duration?: number) {
    this.noticeEl = document.createElement('div');
  }
  hide(): void {}
}

export class Plugin {
  app: any;
  constructor(app: any, _manifest: any) {
    this.app = app;
  }
}

export class App {
  vault: any;
  workspace: any;
}
export class FileSystemAdapter {}
export class FuzzySuggestModal {}
export class Modal {}
export class SettingTab {}

export class PluginSettingTab {
  containerEl!: HTMLElement;
  constructor(_app: any, _plugin: any) {}
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(_name: string): this {
    return this;
  }
  setDesc(_desc: string): this {
    return this;
  }
  addText(_cb: any): this {
    return this;
  }
  addTextArea(_cb: any): this {
    return this;
  }
  addToggle(_cb: any): this {
    return this;
  }
  addDropdown(_cb: any): this {
    return this;
  }
}

export function normalizePath(path: string) {
  return path;
}

export const debounce = (
  fn: (...args: any[]) => any,
  _wait?: number,
  _immediate?: boolean,
): any => {
  return fn;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventRef {}
