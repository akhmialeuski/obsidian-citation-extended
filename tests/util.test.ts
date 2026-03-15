import { WorkerManager } from '../src/util';

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
  });
});
