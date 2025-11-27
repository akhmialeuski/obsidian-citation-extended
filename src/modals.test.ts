import { SearchModal } from './modals';
import { App } from 'obsidian';
import CitationPlugin from './main';

// Mock Obsidian
jest.mock('obsidian', () => {
    class MockFuzzySuggestModal {
        app: any;
        inputEl: HTMLElement;
        resultContainerEl: HTMLElement;
        constructor(app: any) {
            this.app = app;
            this.inputEl = document.createElement('input');
            this.resultContainerEl = document.createElement('div');
            // Mock parent for loadingEl creation
            const parent = document.createElement('div');
            parent.appendChild(this.resultContainerEl);
        }
        onOpen() { }
        onClose() { }
        setInstructions() { }
    }
    return {
        App: jest.fn(),
        FuzzySuggestModal: MockFuzzySuggestModal,
        Notice: jest.fn(),
        EventRef: jest.fn(),
    };
});

jest.mock('./main');

describe('SearchModal', () => {
    let modal: SearchModal;
    let app: App;
    let plugin: CitationPlugin;

    beforeEach(() => {
        app = new App();
        plugin = new CitationPlugin(app, {} as any);
        plugin.events = {
            on: jest.fn(),
            offref: jest.fn(),
        } as any;
        plugin.libraryService = {
            isLibraryLoading: false,
        } as any;

        modal = new SearchModal(app, plugin);
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
