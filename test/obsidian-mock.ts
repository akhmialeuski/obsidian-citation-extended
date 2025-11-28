export class Notice {
    noticeEl: HTMLElement;
    constructor(message: string) {
        this.noticeEl = document.createElement('div');
    }
    hide() { }
}
export class Plugin { }
export class App {
    vault: any;
    workspace: any;
}
export class FileSystemAdapter { }
export class FuzzySuggestModal { }
export class Modal { }
export class SettingTab { }
export class PluginSettingTab {
    constructor(app: any, plugin: any) { }
    display() { }
    hide() { }
}
export class Setting {
    constructor(containerEl: HTMLElement) { }
    setName(name: string) { return this; }
    setDesc(desc: string) { return this; }
    addText(cb: any) { return this; }
    addTextArea(cb: any) { return this; }
    addToggle(cb: any) { return this; }
    addDropdown(cb: any) { return this; }
}
export function normalizePath(path: string) { return path; }
export function debounce(fn: Function) { return fn; }
export interface EventRef { }
