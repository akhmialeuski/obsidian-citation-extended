/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
import { App } from 'obsidian';
// import { CitationSearchModal } from './modals';
// import CitationPlugin from './main';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => {
    class MockFuzzySuggestModal {
      app: any;
      inputEl: HTMLElement;
      resultContainerEl: HTMLElement;
      constructor(app: any) {
        this.app = app;
        this.inputEl = {
          setAttribute: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          focus: jest.fn(),
        } as any;
        this.resultContainerEl = {
          addClass: jest.fn(),
          createEl: jest.fn().mockReturnValue({
            createEl: jest.fn().mockReturnValue({
              addClass: jest.fn(),
              removeClass: jest.fn(),
              setText: jest.fn(),
            }),
            addClass: jest.fn(),
            removeClass: jest.fn(),
            children: [
              { addClass: jest.fn(), removeClass: jest.fn() },
              { addClass: jest.fn(), removeClass: jest.fn() },
            ],
          }),
        } as any;
        // Mock parent for loadingEl creation
        // const _parent = { appendChild: jest.fn() };
      }
      onOpen() {}
      onClose() {}
      setInstructions() {}
      setPlaceholder() {}
      updateSuggestions() {}
    }
    return {
      App: jest.fn(),
      FuzzySuggestModal: MockFuzzySuggestModal,
      SuggestModal: MockFuzzySuggestModal,
      Notice: jest.fn(),
      EventRef: jest.fn(),
      Events: class {
        on() {}
        off() {}
        trigger() {}
      },
      PluginSettingTab: class {},
      Plugin: class {},
    };
  },
  { virtual: true },
);

jest.mock(
  'web-worker:./worker',
  () => {
    return class MockWorker {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
    };
  },
  { virtual: true },
);

describe('CitationSearchModal', () => {
  let CitationSearchModal: any;
  let CitationPlugin: any;
  let modal: any;
  let app: App;
  let plugin: any;

  beforeAll(() => {
    CitationSearchModal = require('./modals').CitationSearchModal;
    CitationPlugin = require('./main').default;
  });

  beforeEach(() => {
    app = new App();
    plugin = new CitationPlugin(app, {} as any);
    plugin.events = {
      on: jest.fn(),
      offref: jest.fn(),
    } as any;
    plugin.libraryService = {
      isLibraryLoading: false,
      state: { status: 'idle' },
    } as any;

    const mockAction = {
      name: 'Mock Action',
      onChoose: jest.fn(),
    };
    modal = new CitationSearchModal(app, plugin, mockAction);
  });

  it('should register event listeners on open', () => {
    jest.useFakeTimers();
    const addSpy = jest.spyOn(modal.inputEl, 'addEventListener');

    modal.onOpen();
    jest.runAllTimers();

    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('keyup', expect.any(Function));

    jest.useRealTimers();
  });

  it('should remove event listeners on close', () => {
    jest.useFakeTimers();
    modal.onOpen();
    jest.runAllTimers();

    const removeSpy = jest.spyOn(modal.inputEl, 'removeEventListener');
    modal.onClose();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function));

    jest.useRealTimers();
  });

  it('should clear timeout on close if called early', () => {
    jest.useFakeTimers();
    modal.onOpen();

    const clearSpy = jest.spyOn(window, 'clearTimeout');
    modal.onClose();

    expect(clearSpy).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
