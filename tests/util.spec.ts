import {
  WorkerManager,
  DISALLOWED_FILENAME_CHARACTERS_RE,
  DISALLOWED_SEGMENT_CHARACTERS_RE,
} from '../src/util';

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

let mockPostMessage: jest.Mock;

jest.mock('promise-worker', () => {
  return jest.fn().mockImplementation(() => {
    mockPostMessage = jest.fn().mockResolvedValue('result');
    return { postMessage: mockPostMessage };
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

  it('should post message and return result', async () => {
    const result = await manager.post({
      databaseRaw: '',
      databaseType: 'csl-json',
    });
    expect(result).toBe('result');
    expect(mockPostMessage).toHaveBeenCalledWith({
      databaseRaw: '',
      databaseType: 'csl-json',
    });
  });

  it('should process multiple messages sequentially', async () => {
    const results = await Promise.all([
      manager.post({ databaseRaw: 'a', databaseType: 'csl-json' }),
      manager.post({ databaseRaw: 'b', databaseType: 'csl-json' }),
    ]);
    expect(results).toEqual(['result', 'result']);
    expect(mockPostMessage).toHaveBeenCalledTimes(2);
  });

  it('should reject with AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.post(
        { databaseRaw: '', databaseType: 'csl-json' },
        controller.signal,
      ),
    ).rejects.toThrow('Aborted');
  });

  it('should reject with AbortError when signal aborts after worker completes', async () => {
    const controller = new AbortController();

    // Make postMessage resolve, but abort the signal during the await
    mockPostMessage.mockImplementation(async () => {
      controller.abort();
      return 'result';
    });

    await expect(
      manager.post(
        { databaseRaw: '', databaseType: 'csl-json' },
        controller.signal,
      ),
    ).rejects.toThrow('Aborted');
  });

  it('should reject with AbortError when worker throws and signal is aborted', async () => {
    const controller = new AbortController();

    mockPostMessage.mockImplementation(async () => {
      controller.abort();
      throw new Error('worker error');
    });

    await expect(
      manager.post(
        { databaseRaw: '', databaseType: 'csl-json' },
        controller.signal,
      ),
    ).rejects.toThrow('Aborted');
  });

  it('should reject with worker error when no signal is provided', async () => {
    mockPostMessage.mockRejectedValue(new Error('parse failed'));

    await expect(
      manager.post({ databaseRaw: 'bad', databaseType: 'csl-json' }),
    ).rejects.toThrow('parse failed');
  });

  it('should wrap non-Error rejections in an Error', async () => {
    mockPostMessage.mockRejectedValue('string error');

    await expect(
      manager.post({ databaseRaw: 'bad', databaseType: 'csl-json' }),
    ).rejects.toThrow('string error');
  });

  it('should dispose: clear queue and terminate worker', () => {
    manager.dispose();
    expect(worker.terminate).toHaveBeenCalled();
  });
});

describe('Regex constants', () => {
  it('DISALLOWED_FILENAME_CHARACTERS_RE matches all forbidden chars', () => {
    const forbidden = '*"\\/<>:|?';
    for (const ch of forbidden) {
      expect(ch).toMatch(DISALLOWED_FILENAME_CHARACTERS_RE);
    }
    expect('a').not.toMatch(DISALLOWED_FILENAME_CHARACTERS_RE);
  });

  it('DISALLOWED_SEGMENT_CHARACTERS_RE allows forward slash', () => {
    expect('/').not.toMatch(DISALLOWED_SEGMENT_CHARACTERS_RE);
    expect('*').toMatch(DISALLOWED_SEGMENT_CHARACTERS_RE);
    expect(':').toMatch(DISALLOWED_SEGMENT_CHARACTERS_RE);
  });
});
