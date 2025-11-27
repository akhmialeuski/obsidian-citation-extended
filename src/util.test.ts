import { Notifier, WorkerManager } from './util';
import { Notice } from 'obsidian';

jest.mock('obsidian', () => ({
    Notice: jest.fn().mockImplementation(() => ({
        hide: jest.fn(),
        noticeEl: document.createElement('div'),
    })),
}));

jest.mock('promise-worker', () => {
    return jest.fn().mockImplementation(() => ({
        postMessage: jest.fn().mockResolvedValue('result'),
    }));
});

describe('Notifier', () => {
    let notifier: Notifier;

    beforeEach(() => {
        // Mock MutationObserver
        global.MutationObserver = jest.fn().mockImplementation(() => ({
            observe: jest.fn(),
            disconnect: jest.fn(),
            takeRecords: jest.fn(),
        }));

        notifier = new Notifier('Default message');
    });

    it('should show a notice', () => {
        const result = notifier.show();
        expect(result).toBe(true);
        expect(Notice).toHaveBeenCalled();
    });

    it('should not show a notice if one is already shown', () => {
        notifier.show();
        const result = notifier.show();
        expect(result).toBe(false);
    });

    it('should hide the notice', () => {
        notifier.show();
        notifier.hide();
        expect((notifier as any).currentNotice).toBeNull();
    });

    it('should destroy the notifier', () => {
        notifier.destroy();
        expect((notifier as any).isDestroyed).toBe(true);
    });

    it('should not show notice after destroy', () => {
        notifier.destroy();
        const result = notifier.show();
        expect(result).toBe(false);
    });
});

describe('WorkerManager', () => {
    let worker: Worker;
    let manager: WorkerManager;

    beforeEach(() => {
        worker = {
            terminate: jest.fn(),
            postMessage: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
            onmessage: null,
            onmessageerror: null,
            onerror: null,
        } as unknown as Worker;
        manager = new WorkerManager(worker, { blockingChannel: true });
    });

    it('should terminate the worker', () => {
        manager.terminate();
        expect(worker.terminate).toHaveBeenCalled();
        expect((manager as any)._worker).toBeNull();
    });
});
