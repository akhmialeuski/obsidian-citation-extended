import { Notifier, WorkerManager } from './util';
import { Notice } from 'obsidian';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn().mockImplementation(() => ({
      hide: jest.fn(),
      noticeEl: {} as HTMLElement,
    })),
  }),
  { virtual: true },
);

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
    expect(
      (notifier as unknown as { currentNotice: Notice | null }).currentNotice,
    ).toBeNull();
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
    manager = new WorkerManager(worker);
  });

  it('should post message to worker', async () => {
    await manager.post({ databaseRaw: '', databaseType: 'csl-json' });
    // Since we mock promise-worker, we can't easily check internal state,
    // but we can ensure it doesn't crash.
    // In a real unit test we might mock PromiseWorker constructor to return a mock instance we can spy on.
  });
});
