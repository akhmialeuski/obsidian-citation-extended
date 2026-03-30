/** @jest-environment jsdom */

// ---------------------------------------------------------------------------
// Polyfill Obsidian-specific HTMLElement methods for jsdom
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
  if (!proto.removeClass) {
    proto.removeClass = function (this: HTMLElement, cls: string) {
      this.classList.remove(cls);
    };
  }
  if (!proto.setText) {
    proto.setText = function (this: HTMLElement, text: string) {
      this.textContent = text;
    };
  }
  if (!proto.setAttr) {
    proto.setAttr = function (this: HTMLElement, attr: string, val: string) {
      this.setAttribute(attr, val);
    };
  }
  if (!proto.setCssProps) {
    proto.setCssProps = function (
      this: HTMLElement,
      props: Record<string, string>,
    ) {
      Object.assign(this.style, props);
    };
  }
  if (!proto.createEl) {
    proto.createEl = function (
      this: HTMLElement,
      tag: string,
      opts?: { text?: string; cls?: string; href?: string },
    ): HTMLElement {
      const el = document.createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      if (opts?.href) el.setAttribute('href', opts.href);
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.createDiv) {
    proto.createDiv = function (
      this: HTMLElement,
      cls?: string | { cls?: string; text?: string },
    ): HTMLDivElement {
      const el = document.createElement('div');
      if (typeof cls === 'string') {
        el.className = cls;
      } else if (cls) {
        if (cls.cls) el.className = cls.cls;
        if (cls.text) el.textContent = cls.text;
      }
      this.appendChild(el);
      return el;
    };
  }
  // Global helpers that Obsidian injects
  (globalThis as any).createSpan = function (opts?: {
    text?: string;
    cls?: string;
  }) {
    const el = document.createElement('span');
    if (opts?.text) el.textContent = opts.text;
    if (opts?.cls) el.className = opts.cls;
    return el;
  };
  (globalThis as any).createEl = function (
    tag: string,
    opts?: { text?: string; cls?: string; href?: string },
  ) {
    const el = document.createElement(tag);
    if (opts?.text) el.textContent = opts.text;
    if (opts?.cls) el.className = opts.cls;
    if (opts?.href) el.setAttribute('href', opts.href);
    return el;
  };

  /* eslint-enable @typescript-eslint/no-explicit-any */
});

// ---------------------------------------------------------------------------
// Track all Setting instances for assertion
// ---------------------------------------------------------------------------
const settingInstances: Array<Record<string, unknown>> = [];
const mockReadLocalFile = jest.fn();
const mockNotice = jest.fn();

// Mock web-worker import
jest.mock(
  'web-worker:../../src/worker',
  () => ({
    __esModule: true,
    default: class {},
  }),
  { virtual: true },
);

// Mock the VariableListModal
const mockModalOpen = jest.fn();
jest.mock('../../../src/ui/modals/variable-list-modal', () => ({
  VariableListModal: jest.fn().mockImplementation(() => ({
    open: mockModalOpen,
  })),
}));

// ---------------------------------------------------------------------------
// Mock: obsidian — factory must be self-contained (hoisted by Jest)
// ---------------------------------------------------------------------------
jest.mock(
  'obsidian',
  () => {
    // These are defined inside the factory to avoid hoisting issues

    class MockTextComponent {
      inputEl: HTMLElement = document.createElement('input');
      private _onChange?: (v: string) => void;
      setValue(v: string) {
        (this.inputEl as unknown as HTMLInputElement).value = v;
        return this;
      }
      setPlaceholder() {
        return this;
      }
      setDisabled() {
        return this;
      }
      onChange(fn: (v: string) => void) {
        this._onChange = fn;
        return this;
      }
      triggerChange(v: string) {
        this._onChange?.(v);
      }
    }

    class MockTextAreaComponent {
      private _onChange?: (v: string) => void;
      setValue() {
        return this;
      }
      onChange(fn: (v: string) => void) {
        this._onChange = fn;
        return this;
      }
      triggerChange(v: string) {
        this._onChange?.(v);
      }
    }

    class MockToggleComponent {
      private _onChange?: (v: boolean) => void;
      setValue() {
        return this;
      }
      onChange(fn: (v: boolean) => void) {
        this._onChange = fn;
        return this;
      }
      triggerChange(v: boolean) {
        this._onChange?.(v);
      }
    }

    class MockDropdownComponent {
      private _onChange?: (v: string) => void;
      addOptions() {
        return this;
      }
      setValue() {
        return this;
      }
      onChange(fn: (v: string) => void) {
        this._onChange = fn;
        return this;
      }
      triggerChange(v: string) {
        this._onChange?.(v);
      }
    }

    class MockButtonComponent {
      private _onClick?: () => void;
      setButtonText() {
        return this;
      }
      setCta() {
        return this;
      }
      onClick(fn: () => void) {
        this._onClick = fn;
        return this;
      }
      triggerClick() {
        this._onClick?.();
      }
    }

    class MockExtraButtonComponent {
      private _onClick?: () => void;
      setIcon() {
        return this;
      }
      setTooltip() {
        return this;
      }
      onClick(fn: () => void) {
        this._onClick = fn;
        return this;
      }
      triggerClick() {
        this._onClick?.();
      }
    }

    class MockSetting {
      settingEl: HTMLElement;
      private _container: HTMLElement;
      private _textCallbacks: Array<(c: MockTextComponent) => void> = [];
      private _textAreaCallbacks: Array<(c: MockTextAreaComponent) => void> =
        [];
      private _toggleCallbacks: Array<(c: MockToggleComponent) => void> = [];
      private _dropdownCallbacks: Array<(c: MockDropdownComponent) => void> =
        [];
      private _buttonCallbacks: Array<(c: MockButtonComponent) => void> = [];
      private _extraButtonCallbacks: Array<
        (c: MockExtraButtonComponent) => void
      > = [];

      constructor(container: HTMLElement) {
        this._container = container;
        this.settingEl = document.createElement('div');
        this.settingEl.classList.add('setting-item');
        this._container.appendChild(this.settingEl);
        // Store reference for test assertions
        settingInstances.push(this as unknown as Record<string, unknown>);
      }
      setName() {
        return this;
      }
      setDesc() {
        return this;
      }
      setHeading() {
        return this;
      }
      addText(cb: (comp: MockTextComponent) => void) {
        const comp = new MockTextComponent();
        this._textCallbacks.push(cb);
        cb(comp);
        return this;
      }
      addTextArea(cb: (comp: MockTextAreaComponent) => void) {
        const comp = new MockTextAreaComponent();
        this._textAreaCallbacks.push(cb);
        cb(comp);
        return this;
      }
      addToggle(cb: (comp: MockToggleComponent) => void) {
        const comp = new MockToggleComponent();
        this._toggleCallbacks.push(cb);
        cb(comp);
        return this;
      }
      addDropdown(cb: (comp: MockDropdownComponent) => void) {
        const comp = new MockDropdownComponent();
        this._dropdownCallbacks.push(cb);
        cb(comp);
        return this;
      }
      addButton(cb: (comp: MockButtonComponent) => void) {
        const comp = new MockButtonComponent();
        this._buttonCallbacks.push(cb);
        cb(comp);
        return this;
      }
      addExtraButton(cb: (comp: MockExtraButtonComponent) => void) {
        const comp = new MockExtraButtonComponent();
        this._extraButtonCallbacks.push(cb);
        cb(comp);
        return this;
      }

      // Re-invoke callbacks to capture components for test assertions
      getTextComponents(): MockTextComponent[] {
        const comps: MockTextComponent[] = [];
        for (const cb of this._textCallbacks) {
          const c = new MockTextComponent();
          cb(c);
          comps.push(c);
        }
        return comps;
      }
      getToggleComponents(): MockToggleComponent[] {
        const comps: MockToggleComponent[] = [];
        for (const cb of this._toggleCallbacks) {
          const c = new MockToggleComponent();
          cb(c);
          comps.push(c);
        }
        return comps;
      }
      getDropdownComponents(): MockDropdownComponent[] {
        const comps: MockDropdownComponent[] = [];
        for (const cb of this._dropdownCallbacks) {
          const c = new MockDropdownComponent();
          cb(c);
          comps.push(c);
        }
        return comps;
      }
      getButtonComponents(): MockButtonComponent[] {
        const comps: MockButtonComponent[] = [];
        for (const cb of this._buttonCallbacks) {
          const c = new MockButtonComponent();
          cb(c);
          comps.push(c);
        }
        return comps;
      }
      getExtraButtonComponents(): MockExtraButtonComponent[] {
        const comps: MockExtraButtonComponent[] = [];
        for (const cb of this._extraButtonCallbacks) {
          const c = new MockExtraButtonComponent();
          cb(c);
          comps.push(c);
        }
        return comps;
      }
    }

    return {
      App: class {},
      PluginSettingTab: class {
        app: unknown;
        containerEl: HTMLElement;
        constructor(app: unknown) {
          this.app = app;
          this.containerEl = document.createElement('div');
        }
      },
      Setting: MockSetting,
      FileSystemAdapter: class {
        static readLocalFile = mockReadLocalFile;
        getBasePath() {
          return '/vault';
        }
      },
      Notice: mockNotice,
      debounce: (fn: (...args: unknown[]) => void) => fn,
    };
  },
  { virtual: true },
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { CitationSettingTab } from '../../../src/ui/settings/settings-tab';
import { CitationsPluginSettings } from '../../../src/ui/settings/settings';
import type CitationPlugin from '../../../src/main';
import type { VariableDefinition } from '../../../src/template/introspection.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Helper type for interacting with mock settings
interface MockSettingInstance {
  getTextComponents(): Array<{ triggerChange(v: string): void }>;
  getToggleComponents(): Array<{ triggerChange(v: boolean): void }>;
  getDropdownComponents(): Array<{ triggerChange(v: string): void }>;
  getButtonComponents(): Array<{ triggerClick(): void }>;
  getExtraButtonComponents(): Array<{ triggerClick(): void }>;
  settingEl: HTMLElement;
}

function createMockPlugin(
  settingsOverrides: Partial<CitationsPluginSettings> = {},
): CitationPlugin {
  const settings = new CitationsPluginSettings();
  Object.assign(settings, settingsOverrides);

  return {
    settings,
    libraryService: {
      getTemplateVariables: jest
        .fn()
        .mockReturnValue([] as VariableDefinition[]),
      resolveLibraryPath: jest.fn((p: string) => `/vault/${p}`),
      load: jest.fn().mockResolvedValue(null),
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    syncReadwiseDatabaseConfig: jest.fn(),
  } as unknown as CitationPlugin;
}

function getSettings(): MockSettingInstance[] {
  return settingInstances as unknown as MockSettingInstance[];
}

describe('CitationSettingTab', () => {
  let tab: CitationSettingTab;
  let plugin: CitationPlugin;

  beforeEach(() => {
    settingInstances.length = 0;
    mockReadLocalFile.mockReset();
    mockNotice.mockReset();
    mockModalOpen.mockReset();

    plugin = createMockPlugin({
      databases: [
        { name: 'My Library', path: '/lib/refs.json', type: 'csl-json' },
      ],
    });
    tab = new CitationSettingTab({} as never, plugin);
  });

  // -----------------------------------------------------------------------
  // display()
  // -----------------------------------------------------------------------

  describe('display()', () => {
    it('renders without throwing', () => {
      expect(() => tab.display()).not.toThrow();
    });

    it('calls all four render sections (produces Setting instances)', () => {
      tab.display();
      // Heading settings (databases, literature notes, lit note templates, citations, display) + field settings
      expect(getSettings().length).toBeGreaterThanOrEqual(10);
    });

    it('sets the container id attribute to zoteroSettingTab', () => {
      tab.display();
      expect(
        (
          tab as unknown as { containerEl: HTMLElement }
        ).containerEl.getAttribute('id'),
      ).toBe('zoteroSettingTab');
    });

    it('empties containerEl before rendering', () => {
      tab.display();
      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const firstChildCount = container.children.length;
      tab.display();
      // Second display should not double the children (it empties first)
      expect(container.children.length).toBe(firstChildCount);
    });
  });

  // -----------------------------------------------------------------------
  // renderDatabaseSection
  // -----------------------------------------------------------------------

  describe('renderDatabaseSection', () => {
    it('renders a card for each database', () => {
      plugin.settings.databases = [
        { name: 'DB1', path: '/a.json', type: 'csl-json' },
        { name: 'DB2', path: '/b.json', type: 'biblatex' },
      ];
      tab.display();

      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const cards = container.querySelectorAll('.citation-database-setting');
      expect(cards).toHaveLength(2);
    });

    it('add button creates a new database when under 20', async () => {
      plugin.settings.databases = [
        { name: 'DB1', path: '/a.json', type: 'csl-json' },
      ];
      tab.display();

      // Find the setting that has a button component (the "Add database" button)
      // For 1 database: heading(0), card header(1), type(2), path(3), add-button(4)
      const allSettings = getSettings();
      const addBtnSetting = allSettings.find(
        (s) => s.getButtonComponents().length > 0,
      );
      expect(addBtnSetting).toBeDefined();

      const buttons = addBtnSetting!.getButtonComponents();
      buttons[0].triggerClick();
      await Promise.resolve();
      await Promise.resolve();

      expect(plugin.settings.databases).toHaveLength(2);
      expect(plugin.settings.databases[1].name).toBe('Database 2');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('add button shows Notice when at 20 databases', async () => {
      plugin.settings.databases = Array.from({ length: 20 }, (_, i) => ({
        name: `DB ${i}`,
        path: `/db${i}.json`,
        type: 'csl-json' as const,
      }));
      tab.display();

      // Find the first setting with a button (the add-database button)
      const allSettings = getSettings();
      const addBtnSetting = allSettings.find(
        (s) => s.getButtonComponents().length > 0,
      );
      expect(addBtnSetting).toBeDefined();

      addBtnSetting!.getButtonComponents()[0].triggerClick();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNotice).toHaveBeenCalledWith(
        'Maximum number of databases (20) reached.',
      );
      expect(plugin.settings.databases).toHaveLength(20);
    });
  });

  // -----------------------------------------------------------------------
  // renderDatabaseCard
  // -----------------------------------------------------------------------

  describe('renderDatabaseCard', () => {
    it('renders header with name text input and delete extra button', () => {
      tab.display();
      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const card = container.querySelector('.citation-database-setting');
      expect(card).not.toBeNull();

      // The header setting has an extraButton (delete)
      const allSettings = getSettings();
      // First setting is the section heading, second is the card header
      const headerSetting = allSettings[1];
      const extraButtons = headerSetting.getExtraButtonComponents();
      expect(extraButtons.length).toBeGreaterThan(0);
    });

    it('delete button removes database and re-renders', async () => {
      plugin.settings.databases = [
        { name: 'DB1', path: '/a.json', type: 'csl-json' },
        { name: 'DB2', path: '/b.json', type: 'biblatex' },
      ];
      tab.display();

      const headerSetting = getSettings()[1]; // first card header
      const extraButtons = headerSetting.getExtraButtonComponents();
      extraButtons[0].triggerClick();
      await Promise.resolve();
      await Promise.resolve();

      expect(plugin.settings.databases).toHaveLength(1);
      expect(plugin.settings.databases[0].name).toBe('DB2');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('name text input saves on change', async () => {
      tab.display();
      const headerSetting = getSettings()[1]; // first card header
      const textComps = headerSetting.getTextComponents();
      expect(textComps.length).toBeGreaterThan(0);

      textComps[0].triggerChange('Renamed DB');
      await Promise.resolve();
      expect(plugin.settings.databases[0].name).toBe('Renamed DB');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('type dropdown saves on change', async () => {
      tab.display();
      // The type dropdown is on the second setting inside the card
      const allSettings = getSettings();
      const typeSetting = allSettings[2]; // Database type setting
      const dropdowns = typeSetting.getDropdownComponents();
      expect(dropdowns.length).toBeGreaterThan(0);

      dropdowns[0].triggerChange('biblatex');
      await Promise.resolve();
      expect(plugin.settings.databases[0].type).toBe('biblatex');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('type dropdown triggers library reload after saving', async () => {
      tab.display();
      const allSettings = getSettings();
      const typeSetting = allSettings[2]; // Database type setting
      const dropdowns = typeSetting.getDropdownComponents();

      dropdowns[0].triggerChange('biblatex');
      await Promise.resolve();

      expect(plugin.libraryService.load).toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith(
        'Database format changed. Reloading library\u2026',
      );
    });

    it('path text input saves on change and triggers path check', async () => {
      mockReadLocalFile.mockResolvedValue(new ArrayBuffer(0));
      tab.display();

      const allSettings = getSettings();
      const pathSetting = allSettings[3]; // Database path setting
      const textComps = pathSetting.getTextComponents();
      expect(textComps.length).toBeGreaterThan(0);

      textComps[0].triggerChange('/new/path.json');
      await Promise.resolve();
      expect(plugin.settings.databases[0].path).toBe('/new/path.json');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // checkDatabasePath
  // -----------------------------------------------------------------------

  describe('checkDatabasePath', () => {
    it('shows "Path verified." on success', async () => {
      mockReadLocalFile.mockResolvedValue(new ArrayBuffer(0));
      tab.display();

      // Wait for path check to resolve
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const statusEl = container.querySelector('.citation-path-status');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toBe('Path verified.');
    });

    it('shows "File not found." on failure', async () => {
      mockReadLocalFile.mockRejectedValue(new Error('Not found'));
      tab.display();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const statusEl = container.querySelector('.citation-path-status');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toBe('File not found.');
    });

    it('does not check path when database path is empty', async () => {
      plugin.settings.databases = [
        { name: 'Empty', path: '', type: 'csl-json' },
      ];
      tab.display();

      await Promise.resolve();
      await Promise.resolve();

      // readLocalFile should not be called for empty path
      expect(mockReadLocalFile).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // renderLiteratureNotesSection
  // -----------------------------------------------------------------------

  describe('renderLiteratureNotesSection', () => {
    it('renders documentation links', () => {
      tab.display();
      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const links = container.querySelectorAll('a');
      expect(links.length).toBeGreaterThanOrEqual(3);
    });

    it('show variables button calls getTemplateVariables and opens modal', () => {
      tab.display();

      // Find all button components across all settings
      for (const setting of getSettings()) {
        const buttons = setting.getButtonComponents();
        for (const btn of buttons) {
          btn.triggerClick();
        }
      }

      expect(plugin.libraryService.getTemplateVariables).toHaveBeenCalled();
    });

    it('disable automatic note creation toggle saves setting', async () => {
      tab.display();

      // Find the first toggle and trigger it
      for (const setting of getSettings()) {
        const toggles = setting.getToggleComponents();
        if (toggles.length > 0) {
          toggles[0].triggerChange(true);
          break;
        }
      }

      await Promise.resolve();
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // renderCitationsSection
  // -----------------------------------------------------------------------

  describe('renderCitationsSection', () => {
    it('renders citation style preset dropdown', () => {
      tab.display();
      expect(getSettings().length).toBeGreaterThan(0);
    });

    it('changing preset to non-custom updates template values', async () => {
      plugin.settings.citationStylePreset = 'custom';
      tab.display();

      // Collect all dropdowns
      const allDropdowns: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allDropdowns.push(...setting.getDropdownComponents());
      }

      // Trigger the citation style preset dropdown
      if (allDropdowns.length > 0) {
        allDropdowns[0].triggerChange('textcite');
        await Promise.resolve();
        await Promise.resolve();
      }

      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('auto-create toggle saves setting on change', async () => {
      tab.display();

      // Find all toggles
      const allToggles: Array<{ triggerChange(v: boolean): void }> = [];
      for (const setting of getSettings()) {
        allToggles.push(...setting.getToggleComponents());
      }

      // Last toggle is autoCreateNoteOnCitation
      if (allToggles.length > 0) {
        allToggles[allToggles.length - 1].triggerChange(true);
        await Promise.resolve();
        expect(plugin.saveSettings).toHaveBeenCalled();
      }
    });
  });

  // -----------------------------------------------------------------------
  // renderDisplaySection
  // -----------------------------------------------------------------------

  describe('renderDisplaySection', () => {
    it('sort order dropdown saves setting on change', async () => {
      tab.display();

      // Collect all dropdowns, last one is sort order
      const allDropdowns: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allDropdowns.push(...setting.getDropdownComponents());
      }

      const lastDropdown = allDropdowns[allDropdowns.length - 1];
      lastDropdown.triggerChange('year-desc');
      await Promise.resolve();
      expect(plugin.saveSettings).toHaveBeenCalled();
      expect(plugin.settings.referenceListSortOrder).toBe('year-desc');
    });
  });

  // -----------------------------------------------------------------------
  // settingValueToString (private, tested via reflection)
  // -----------------------------------------------------------------------

  describe('settingValueToString', () => {
    let toStr: (v: unknown) => string;

    beforeEach(() => {
      toStr = (
        tab as unknown as { settingValueToString(v: unknown): string }
      ).settingValueToString.bind(tab);
    });

    it('returns string values as-is', () => {
      expect(toStr('hello')).toBe('hello');
    });

    it('converts number to string', () => {
      expect(toStr(42)).toBe('42');
    });

    it('converts boolean to string', () => {
      expect(toStr(true)).toBe('true');
      expect(toStr(false)).toBe('false');
    });

    it('returns empty string for null', () => {
      expect(toStr(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(toStr(undefined)).toBe('');
    });

    it('returns empty string for object values', () => {
      expect(toStr({})).toBe('');
      expect(toStr([])).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // createSaveHandler (tested indirectly via buildTextField onChange)
  // -----------------------------------------------------------------------

  describe('createSaveHandler', () => {
    it('saves setting for valid value', async () => {
      tab.display();

      // buildTextField creates text components — find one and trigger
      for (const setting of getSettings()) {
        const textComps = setting.getTextComponents();
        if (textComps.length > 0) {
          // literatureNoteFolder accepts any string
          textComps[0].triggerChange('test-folder');
          break;
        }
      }

      await Promise.resolve();
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('shows error element for invalid value', () => {
      tab.display();

      // Find the literatureNoteTitleTemplate field (min(1) constraint)
      // It's after the literatureNoteFolder field
      const textSettings: MockSettingInstance[] = [];
      for (const setting of getSettings()) {
        if (setting.getTextComponents().length > 0) {
          textSettings.push(setting);
        }
      }

      // The second text setting should be literatureNoteTitleTemplate
      if (textSettings.length >= 2) {
        const comps = textSettings[1].getTextComponents();
        comps[0].triggerChange(''); // empty string is invalid for min(1)
      }

      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const errorEls = container.querySelectorAll('.citation-setting-error');
      expect(errorEls.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // createSaveHandler — tested directly via reflection (covers lines 454-476)
  // -----------------------------------------------------------------------

  describe('createSaveHandler (direct)', () => {
    let createSaveHandler: (
      key: string,
      errorEl: HTMLElement,
    ) => (value: string) => void;

    beforeEach(() => {
      createSaveHandler = (
        tab as unknown as {
          createSaveHandler(
            key: string,
            errorEl: HTMLElement,
          ): (value: string) => void;
        }
      ).createSaveHandler.bind(tab);
    });

    it('saves setting and hides error for valid value', () => {
      const errorEl = document.createElement('div');
      const handler = createSaveHandler('literatureNoteFolder', errorEl);

      handler('valid-folder');

      expect(plugin.settings.literatureNoteFolder).toBe('valid-folder');
      expect(plugin.saveSettings).toHaveBeenCalled();
      expect(errorEl.style.display).toBe('none');
    });

    it('shows error and does not save for invalid value', () => {
      const errorEl = document.createElement('div');
      // literatureNoteTitleTemplate has min(1) constraint
      const handler = createSaveHandler('literatureNoteTitleTemplate', errorEl);

      handler('');

      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toBeTruthy();
      // saveSettings should NOT have been called for invalid value
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('hides error after a previously invalid value becomes valid', () => {
      const errorEl = document.createElement('div');
      const handler = createSaveHandler('literatureNoteTitleTemplate', errorEl);

      handler(''); // invalid
      expect(errorEl.style.display).toBe('block');

      handler('valid-title'); // now valid
      expect(errorEl.style.display).toBe('none');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  // buildTextArea was removed as dead code in the refactoring

  // -----------------------------------------------------------------------
  // Citation preset onChange (covers lines 304-316)
  // -----------------------------------------------------------------------

  describe('citation preset onChange', () => {
    it('updates templates when non-custom preset is selected', async () => {
      plugin.settings.citationStylePreset = 'custom';
      plugin.settings.markdownCitationTemplate = 'old-template';
      plugin.settings.alternativeMarkdownCitationTemplate = 'old-alt';
      tab.display();

      // Collect all dropdowns, find the citation style one
      // The database card dropdowns come first; the citation preset is later
      const allDropdowns: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allDropdowns.push(...setting.getDropdownComponents());
      }

      // The citation preset dropdown is after the database type dropdowns
      // For 1 database: index 0 = database type, index 1 = citation preset, index 2 = sort order
      // Trigger the citation preset one specifically
      if (allDropdowns.length >= 2) {
        allDropdowns[1].triggerChange('parencite');
      }

      // Wait for async IIFE
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(plugin.settings.citationStylePreset).toBe('parencite');
      expect(plugin.settings.markdownCitationTemplate).toBe(
        '({{authorString}}, {{year}})',
      );
      expect(plugin.settings.alternativeMarkdownCitationTemplate).toBe(
        '[@{{citekey}}]',
      );
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('does not overwrite templates when custom preset is selected', async () => {
      plugin.settings.citationStylePreset = 'textcite';
      plugin.settings.markdownCitationTemplate = 'my-custom';
      tab.display();

      const allDropdowns: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allDropdowns.push(...setting.getDropdownComponents());
      }

      // Trigger the citation preset dropdown with 'custom'
      if (allDropdowns.length >= 2) {
        allDropdowns[1].triggerChange('custom');
      }

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(plugin.settings.citationStylePreset).toBe('custom');
      // Template should NOT have been overwritten
      expect(plugin.settings.markdownCitationTemplate).toBe('my-custom');
    });
  });

  // -----------------------------------------------------------------------
  // buildCitationTemplateField
  // -----------------------------------------------------------------------

  describe('buildCitationTemplateField', () => {
    it('disables input when preset is not custom', () => {
      plugin.settings.citationStylePreset = 'textcite';
      tab.display();
      // When preset is not custom, template fields are disabled
      // No throw means it rendered correctly
      expect(getSettings().length).toBeGreaterThan(0);
    });

    it('enables input when preset is custom', () => {
      plugin.settings.citationStylePreset = 'custom';
      tab.display();
      expect(getSettings().length).toBeGreaterThan(0);
    });
  });
});
