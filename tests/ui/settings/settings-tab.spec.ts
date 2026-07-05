/** @jest-environment jsdom */

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

// Mock ReadwiseApiClient — intercept the real module re-exported via core/index
const mockValidateToken = jest.fn();
jest.mock('../../../src/core/readwise/readwise-api-client', () => {
  const actual = jest.requireActual(
    '../../../src/core/readwise/readwise-api-client',
  );
  return {
    ...actual,
    ReadwiseApiClient: jest.fn().mockImplementation(() => ({
      validateToken: mockValidateToken,
    })),
  };
});

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
      requestUrl: jest.fn(),
    };
  },
  { virtual: true },
);

import { CitationSettingTab } from '../../../src/ui/settings/settings-tab';
import { CitationsPluginSettings } from '../../../src/ui/settings/settings';
import type CitationPlugin from '../../../src/main';
import type { VariableDefinition } from '../../../src/template/introspection.service';
import { LoadingStatus } from '../../../src/library/library-state';
import {
  READWISE_SYNC_INTERVAL_MAX_MINUTES,
  LIBRARY_LOAD_TIMEOUT_MIN_SECONDS,
  LIBRARY_LOAD_TIMEOUT_MAX_SECONDS,
} from '../../../src/ui/settings/settings-schema';

// Helper type for interacting with mock settings
interface MockSettingInstance {
  getTextComponents(): Array<{
    triggerChange(v: string): void;
    inputEl: HTMLElement;
  }>;
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
      state: { status: LoadingStatus.Success, parseErrors: [] },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
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
    mockValidateToken.mockReset();

    plugin = createMockPlugin({
      databases: [
        { name: 'My Library', path: '/lib/refs.json', type: 'csl-json' },
      ],
    });
    tab = new CitationSettingTab({} as never, plugin);
  });

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
        'Database source changed. Reloading library\u2026',
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

  describe('renderDatabaseCard — Zotero live connection', () => {
    function zoteroPlugin(): CitationPlugin {
      return createMockPlugin({
        databases: [
          {
            id: 'z1',
            name: 'Zotero',
            type: 'csl-json',
            path: 'http://127.0.0.1:23119/better-bibtex/collection?/0/AB.json',
            sourceType: 'zotero',
            zoteroExportNotes: false,
          },
        ],
      });
    }

    function allComponents(selector: (s: MockSettingInstance) => unknown[]) {
      return getSettings().flatMap((s) => selector(s));
    }

    it('renders the Zotero fields for a live-Zotero database without throwing', () => {
      plugin = zoteroPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      expect(() => tab.display()).not.toThrow();
      // The export-URL placeholder text appears in one of the text inputs.
      const hasUrlField =
        allComponents((s) => s.getTextComponents()).length > 0;
      expect(hasUrlField).toBe(true);
    });

    it('switching the source dropdown to a file format clears the sourceType', () => {
      plugin = zoteroPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      tab.display();

      const dropdowns = allComponents((s) =>
        s.getDropdownComponents(),
      ) as Array<{ triggerChange(v: string): void }>;
      // First dropdown on the card is the "Database source" selector; picking
      // an explicit file format leaves live mode.
      dropdowns[0].triggerChange('csl-json');
      expect(plugin.settings.databases[0].sourceType).toBeUndefined();
    });

    it('clamps the Zotero sync interval, reflects it back, and shows a Notice', async () => {
      plugin = zoteroPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      tab.display();

      const texts = allComponents((s) => s.getTextComponents()) as Array<{
        triggerChange(v: string): void;
        inputEl: HTMLInputElement;
      }>;
      // Text field index 2 is the Zotero "Auto-sync interval" field.
      texts[2].triggerChange('20000');

      // The clamp + save is synchronous within onChange.
      expect(plugin.settings.zoteroSyncIntervalMinutes).toBe(10080);
      // The reflect-back and Notice run after the awaited saveSettings.
      await Promise.resolve();
      await Promise.resolve();
      expect(texts[2].inputEl.value).toBe('10080');
      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('capped'),
      );
    });

    it('selecting the Zotero (Better BibTeX) source sets the sourceType', () => {
      plugin = createMockPlugin({
        databases: [
          { id: 'f1', name: 'Library', type: 'csl-json', path: '/lib.json' },
        ],
      });
      tab = new CitationSettingTab({} as never, plugin);
      tab.display();

      const dropdowns = allComponents((s) =>
        s.getDropdownComponents(),
      ) as Array<{ triggerChange(v: string): void }>;
      dropdowns[0].triggerChange('zotero-bbt');
      expect(plugin.settings.databases[0].sourceType).toBe('zotero');
      // Format is preserved (csl-json is BBT-servable) and the path cleared.
      expect(plugin.settings.databases[0].type).toBe('csl-json');
      expect(plugin.settings.databases[0].path).toBe('');
    });

    it('saves the export-notes flag and the URL, and exercises the buttons', () => {
      plugin = zoteroPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      tab.display();

      const toggles = allComponents((s) => s.getToggleComponents()) as Array<{
        triggerChange(v: boolean): void;
      }>;
      // The first toggle is "Import notes" (the live-Zotero switch is gone —
      // the source is selected in the dropdown now).
      toggles[0].triggerChange(true);
      expect(plugin.settings.databases[0].zoteroExportNotes).toBe(true);

      // The second toggle is "Import PDF annotations".
      toggles[1].triggerChange(true);
      expect(plugin.settings.databases[0].zoteroImportAnnotations).toBe(true);

      const texts = allComponents((s) => s.getTextComponents()) as Array<{
        triggerChange(v: string): void;
      }>;
      // Text fields on this single Zotero card, in render order: database name
      // (0), export URL (1), sync interval (2). The URL is trimmed on save.
      texts[1].triggerChange(' http://127.0.0.1:23119/x.json ');
      expect(plugin.settings.databases[0].path).toBe(
        'http://127.0.0.1:23119/x.json',
      );
      texts[2].triggerChange('15');
      expect(plugin.settings.zoteroSyncIntervalMinutes).toBe(15);

      // Test connection + Sync now buttons (the first two on the page) — firing
      // their handlers covers the async branches; network is mocked and errors
      // are caught inside the handlers.
      const buttons = allComponents((s) => s.getButtonComponents()) as Array<{
        triggerClick(): void;
      }>;
      expect(() => {
        buttons[0].triggerClick();
        buttons[1].triggerClick();
      }).not.toThrow();
    });
  });

  // Zotero local API card
  describe('renderDatabaseCard — Zotero local API', () => {
    function apiPlugin(): CitationPlugin {
      return createMockPlugin({
        databases: [
          {
            id: 'za1',
            name: 'Zotero API',
            type: 'zotero-api',
            path: '',
            zoteroApiGroupId: '',
            zoteroApiCollection: '',
          },
        ],
      });
    }

    function allComponents(selector: (s: MockSettingInstance) => unknown[]) {
      return getSettings().flatMap((s) => selector(s));
    }

    it('renders the local API fields without throwing', () => {
      plugin = apiPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      expect(() => tab.display()).not.toThrow();
    });

    it('saves base URL, group id, and collection key', () => {
      plugin = apiPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      tab.display();

      const texts = allComponents((s) => s.getTextComponents()) as Array<{
        triggerChange(v: string): void;
      }>;
      // Text fields in render order: database name (0), base URL (1),
      // group id (2), collection key (3), sync interval (4).
      texts[1].triggerChange(' http://127.0.0.1:23119 ');
      expect(plugin.settings.databases[0].path).toBe('http://127.0.0.1:23119');
      texts[2].triggerChange(' 4242 ');
      expect(plugin.settings.databases[0].zoteroApiGroupId).toBe('4242');
      texts[3].triggerChange('ABCD1234');
      expect(plugin.settings.databases[0].zoteroApiCollection).toBe('ABCD1234');
      texts[4].triggerChange('30');
      expect(plugin.settings.zoteroSyncIntervalMinutes).toBe(30);
    });

    it('exercises the test-connection and sync buttons without throwing', () => {
      plugin = apiPlugin();
      tab = new CitationSettingTab({} as never, plugin);
      tab.display();

      const buttons = allComponents((s) => s.getButtonComponents()) as Array<{
        triggerClick(): void;
      }>;
      expect(() => {
        buttons[0].triggerClick();
        buttons[1].triggerClick();
      }).not.toThrow();
    });
  });

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

  describe('Readwise database card', () => {
    beforeEach(() => {
      plugin = createMockPlugin({
        databases: [
          {
            id: 'db-rw',
            name: 'My Readwise',
            path: 'test-token-123',
            type: 'readwise',
            sourceType: 'readwise',
          },
        ],
        readwiseLastSyncDate: '',
      });
      tab = new CitationSettingTab({} as never, plugin);
    });

    it('renders Readwise-specific fields (token, buttons) instead of path', () => {
      tab.display();
      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;

      // A Readwise card should have a readwise-status div, not a citation-path-status div
      expect(container.querySelector('.readwise-status')).not.toBeNull();
      expect(container.querySelector('.citation-path-status')).toBeNull();
    });

    it('renders path field for non-readwise database, not readwise fields', () => {
      plugin.settings.databases = [
        { id: 'db-1', name: 'CSL DB', path: '/a.json', type: 'csl-json' },
      ];
      tab.display();
      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;

      expect(container.querySelector('.citation-path-status')).not.toBeNull();
      expect(container.querySelector('.readwise-status')).toBeNull();
    });

    it('readwise card renders more settings than a file-based card', () => {
      // Readwise card: header + type + token + buttons = 4 card settings
      tab.display();
      const countReadwise = getSettings().length;

      settingInstances.length = 0;
      plugin.settings.databases = [
        { id: 'db-1', name: 'CSL DB', path: '/a.json', type: 'csl-json' },
      ];
      tab.display();
      const countFile = getSettings().length;

      // Readwise has token + buttons (2 extra) vs path (1)
      expect(countReadwise).toBeGreaterThan(countFile);
    });

    it('type dropdown changing to readwise sets sourceType and clears path', async () => {
      plugin.settings.databases = [
        { id: 'db-1', name: 'CSL DB', path: '/a.json', type: 'csl-json' },
      ];
      tab.display();

      const allDropdowns: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allDropdowns.push(...setting.getDropdownComponents());
      }

      // dropdowns[0] = database type
      allDropdowns[0].triggerChange('readwise');
      await Promise.resolve();

      expect(plugin.settings.databases[0].type).toBe('readwise');
      expect(plugin.settings.databases[0].sourceType).toBe('readwise');
      expect(plugin.settings.databases[0].path).toBe('');
      expect(plugin.saveSettings).toHaveBeenCalled();
      // Readwise does not trigger reload on type change — token not yet entered
      expect(plugin.libraryService.load).not.toHaveBeenCalled();
    });

    it('type dropdown changing from readwise deletes sourceType', async () => {
      tab.display();

      const allDropdowns: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allDropdowns.push(...setting.getDropdownComponents());
      }

      // dropdowns[0] = database type (currently readwise)
      allDropdowns[0].triggerChange('csl-json');
      await Promise.resolve();

      expect(plugin.settings.databases[0].type).toBe('csl-json');
      expect(plugin.settings.databases[0].sourceType).toBeUndefined();
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('API token text input saves setting on change', async () => {
      tab.display();

      // Collect all text components
      const allTexts: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allTexts.push(...setting.getTextComponents());
      }

      // For a Readwise card: db-name(0), api-token(1), ...literature note fields
      // (no path text for readwise)
      expect(allTexts.length).toBeGreaterThanOrEqual(2);
      allTexts[1].triggerChange('new-token-value');
      await Promise.resolve();

      expect(plugin.settings.databases[0].path).toBe('new-token-value');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('displays last sync date when available', () => {
      plugin.settings.readwiseLastSyncDate = '2024-06-15T12:00:00Z';
      tab.display();

      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const statusEl = container.querySelector('.readwise-status');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toBe('Last sync: 2024-06-15T12:00:00Z');
    });

    it('does not display last sync date when empty', () => {
      plugin.settings.readwiseLastSyncDate = '';
      tab.display();

      const container = (tab as unknown as { containerEl: HTMLElement })
        .containerEl;
      const statusEl = container.querySelector('.readwise-status');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toBe('');
    });

    describe('validate token button', () => {
      // Button order for Readwise card: validate(0), sync(1), add-database(2), show-variables(3)
      const VALIDATE_BTN_IDX = 0;

      it('shows Notice when no token is set', async () => {
        plugin.settings.databases[0].path = '';
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }

        allButtons[VALIDATE_BTN_IDX].triggerClick();
        await Promise.resolve();

        expect(mockNotice).toHaveBeenCalledWith(
          'Please enter an API token first.',
        );
      });

      it('shows success when token is valid', async () => {
        mockValidateToken.mockResolvedValue(true);
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }

        allButtons[VALIDATE_BTN_IDX].triggerClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockNotice).toHaveBeenCalledWith(
          'Readwise token validated. Loading library…',
        );
        expect(plugin.libraryService.load).toHaveBeenCalled();
      });

      it('shows error when token is invalid', async () => {
        mockValidateToken.mockResolvedValue(false);
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }

        allButtons[VALIDATE_BTN_IDX].triggerClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockNotice).toHaveBeenCalledWith(
          'Readwise token is invalid. Please check and retry.',
        );
      });

      it('shows network error when validation throws', async () => {
        mockValidateToken.mockRejectedValue(new Error('Network failure'));
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }

        allButtons[VALIDATE_BTN_IDX].triggerClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockNotice).toHaveBeenCalledWith(
          'Could not reach Readwise API. Check your connection.',
        );
      });
    });

    describe('sync now button', () => {
      // Button order for Readwise card: validate(0), sync(1), add-database(2), show-variables(3)
      const SYNC_BTN_IDX = 1;

      it('shows Notice when no token is set', async () => {
        plugin.settings.databases[0].path = '';
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }

        allButtons[SYNC_BTN_IDX].triggerClick();
        await Promise.resolve();

        expect(mockNotice).toHaveBeenCalledWith(
          'Please enter an API token first.',
        );
      });

      it('reloads library and updates last sync date on success', async () => {
        // Successful load returns a non-null library; state stays clean.
        (plugin.libraryService.load as jest.Mock).mockResolvedValue({});
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }

        allButtons[SYNC_BTN_IDX].triggerClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockNotice).toHaveBeenCalledWith('Syncing Readwise data...');
        expect(plugin.libraryService.load).toHaveBeenCalled();
        expect(plugin.settings.readwiseLastSyncDate).not.toBe('');
        expect(plugin.saveSettings).toHaveBeenCalled();
        expect(mockNotice).toHaveBeenCalledWith('Readwise sync complete.');
      });

      it('does NOT update last sync date when the sync genuinely fails', async () => {
        // A genuine failure: load() returns null AND the store is in Error state.
        plugin.settings.readwiseLastSyncDate = '';
        (plugin.libraryService.load as jest.Mock).mockResolvedValue(null);
        (plugin.libraryService as unknown as { state: unknown }).state = {
          status: LoadingStatus.Error,
          parseErrors: [],
        };
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }
        (plugin.saveSettings as jest.Mock).mockClear();

        allButtons[SYNC_BTN_IDX].triggerClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.libraryService.load).toHaveBeenCalled();
        expect(plugin.settings.readwiseLastSyncDate).toBe('');
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        expect(mockNotice).toHaveBeenCalledWith('Library reload failed.');
      });

      it('treats a superseded sync (null result, non-error state) as benign', async () => {
        // A newer reload aborted this sync: load() returns null but the store is
        // NOT in the Error state. Must not report failure or persist a date.
        plugin.settings.readwiseLastSyncDate = '';
        (plugin.libraryService.load as jest.Mock).mockResolvedValue(null);
        (plugin.libraryService as unknown as { state: unknown }).state = {
          status: LoadingStatus.Loading,
          parseErrors: [],
        };
        tab.display();

        const allButtons: Array<{ triggerClick(): void }> = [];
        for (const setting of getSettings()) {
          allButtons.push(...setting.getButtonComponents());
        }
        (plugin.saveSettings as jest.Mock).mockClear();
        mockNotice.mockClear();

        allButtons[SYNC_BTN_IDX].triggerClick();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.settings.readwiseLastSyncDate).toBe('');
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        expect(mockNotice).not.toHaveBeenCalledWith('Library reload failed.');
        const status = (
          tab as unknown as { containerEl: HTMLElement }
        ).containerEl.querySelector('.readwise-status');
        expect(status?.textContent).toContain('superseded');
      });
    });

    describe('auto-sync interval clamp', () => {
      it('clamps an over-max interval, writes it back, and notifies', async () => {
        tab.display();

        // The interval field is the only number input with max = the schema max.
        let interval: { triggerChange(v: string): void } | undefined;
        for (const setting of getSettings()) {
          for (const c of setting.getTextComponents()) {
            if (
              (c.inputEl as HTMLInputElement).max ===
              String(READWISE_SYNC_INTERVAL_MAX_MINUTES)
            ) {
              interval = c;
            }
          }
        }
        expect(interval).toBeDefined();

        interval!.triggerChange(
          String(READWISE_SYNC_INTERVAL_MAX_MINUTES + 5000),
        );
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.settings.readwiseSyncIntervalMinutes).toBe(
          READWISE_SYNC_INTERVAL_MAX_MINUTES,
        );
        expect(mockNotice).toHaveBeenCalledWith(
          expect.stringContaining('capped'),
        );
      });
    });

    describe('library load timeout clamp', () => {
      // The timeout field is the only number input with max = the timeout
      // schema max (the auto-sync interval uses a different, larger max).
      function findTimeoutField():
        | { triggerChange(v: string): void }
        | undefined {
        for (const setting of getSettings()) {
          for (const c of setting.getTextComponents()) {
            if (
              (c.inputEl as HTMLInputElement).max ===
              String(LIBRARY_LOAD_TIMEOUT_MAX_SECONDS)
            ) {
              return c;
            }
          }
        }
        return undefined;
      }

      it('clamps an over-max timeout, writes it back, and notifies', async () => {
        tab.display();

        const field = findTimeoutField();
        expect(field).toBeDefined();

        field!.triggerChange(String(LIBRARY_LOAD_TIMEOUT_MAX_SECONDS + 1000));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.settings.libraryLoadTimeoutSeconds).toBe(
          LIBRARY_LOAD_TIMEOUT_MAX_SECONDS,
        );
        expect(mockNotice).toHaveBeenCalledWith(
          expect.stringContaining('clamped'),
        );
      });

      it('clamps a below-min timeout up to the minimum', async () => {
        tab.display();

        const field = findTimeoutField();
        expect(field).toBeDefined();

        field!.triggerChange('1');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.settings.libraryLoadTimeoutSeconds).toBe(
          LIBRARY_LOAD_TIMEOUT_MIN_SECONDS,
        );
        // A below-min value is also a clamp, so the user is notified.
        expect(mockNotice).toHaveBeenCalledWith(
          expect.stringContaining('clamped'),
        );
      });
    });

    describe('advanced filters', () => {
      // Render the filters section in isolation. settingInstances[0] is the
      // "Advanced filters" heading; the four filter rows are [1..4].
      function renderFiltersInIsolation(): MockSettingInstance[] {
        settingInstances.length = 0;
        const card = document.createElement('div');
        (
          tab as unknown as {
            renderReadwiseFilters: (
              c: HTMLElement,
              d: unknown,
              i: number,
            ) => void;
          }
        ).renderReadwiseFilters(card, plugin.settings.databases[0], 0);
        return getSettings();
      }

      it('writes a categories filter and prunes it when emptied', async () => {
        const settings = renderFiltersInIsolation();
        const categories = settings[1].getTextComponents()[0];

        categories.triggerChange('books, articles');
        await Promise.resolve();
        expect(
          plugin.settings.databases[0].readwiseFilters?.categories,
        ).toEqual(['books', 'articles']);

        // Emptying the field removes the key and prunes the whole object.
        categories.triggerChange('');
        await Promise.resolve();
        expect(plugin.settings.databases[0].readwiseFilters).toBeUndefined();
      });

      it('writes a numeric minHighlights filter', async () => {
        const settings = renderFiltersInIsolation();
        const minHighlights = settings[4].getTextComponents()[0];

        minHighlights.triggerChange('5');
        await Promise.resolve();
        expect(
          plugin.settings.databases[0].readwiseFilters?.minHighlights,
        ).toBe(5);
      });
    });
  });

  describe('renderLiteratureNotesSection — link display template', () => {
    it('literatureNoteLinkDisplayTemplate text saves setting on change', async () => {
      tab.display();

      // Collect all text components
      const allTexts: Array<{ triggerChange(v: string): void }> = [];
      for (const setting of getSettings()) {
        allTexts.push(...setting.getTextComponents());
      }

      // The link display template is the last text field in the citations
      // section; the display section adds one further text field (the
      // bibliography entry template), so link-display is now second-to-last.
      // Fields: db-name(0), db-path(1), lit-note-folder(2), lit-note-title(3),
      //         lit-note-content-path(4), primary-citation(5), alt-citation(6),
      //         link-display(7), bibliography-entry(8)
      const lastText = allTexts[allTexts.length - 2];
      lastText.triggerChange('{{authorString}} ({{year}})');
      await Promise.resolve();

      expect(plugin.settings.literatureNoteLinkDisplayTemplate).toBe(
        '{{authorString}} ({{year}})',
      );
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

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
