import {
  WorkerManager,
  DISALLOWED_FILENAME_CHARACTERS_RE,
  DISALLOWED_SEGMENT_CHARACTERS_RE,
} from '../src/util';
import { WORKER_TASK_KINDS } from '../src/core';
import type {
  ParseWorkerRequest,
  WorkerRpcRequest,
  WorkerRpcResponse,
} from '../src/core';

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

/**
 * Fake Worker implementing the id-correlated RPC protocol. The `handler`
 * decides how each request is answered (sync resolve, error, or never).
 */
class FakeRpcWorker {
  static instances: FakeRpcWorker[] = [];
  terminated = false;
  received: WorkerRpcRequest[] = [];
  private listeners = new Map<string, Set<(ev: unknown) => void>>();

  constructor(
    private handler: (
      req: WorkerRpcRequest,
      respond: (res: WorkerRpcResponse) => void,
    ) => void,
  ) {
    FakeRpcWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (ev: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: WorkerRpcRequest): void {
    this.received.push(message);
    this.handler(message, (res) => this.emit('message', { data: res }));
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function parseRequest(raw = ''): ParseWorkerRequest {
  return {
    kind: WORKER_TASK_KINDS.Parse,
    databaseRaw: raw,
    databaseType: 'csl-json',
  };
}

/** Handler that resolves every request with an empty parse result. */
function okHandler(
  req: WorkerRpcRequest,
  respond: (res: WorkerRpcResponse) => void,
): void {
  // Answer asynchronously, like a real worker.
  setTimeout(
    () => respond({ id: req.id, result: { entries: [], parseErrors: [] } }),
    0,
  );
}

describe('WorkerManager (pool + RPC)', () => {
  beforeEach(() => {
    FakeRpcWorker.instances = [];
  });

  function makeManager(
    handler: ConstructorParameters<typeof FakeRpcWorker>[0] = okHandler,
    maxWorkers = 2,
  ): WorkerManager {
    return new WorkerManager(
      () => new FakeRpcWorker(handler) as unknown as Worker,
      maxWorkers,
    );
  }

  it('posts a message and resolves with the worker result', async () => {
    const manager = makeManager();
    const result = await manager.post(parseRequest());
    expect(result).toEqual({ entries: [], parseErrors: [] });
    expect(FakeRpcWorker.instances).toHaveLength(1);
    expect(FakeRpcWorker.instances[0].received[0].request).toEqual(
      parseRequest(),
    );
  });

  it('runs tasks in parallel across pooled workers', async () => {
    const manager = makeManager(okHandler, 2);
    await Promise.all([
      manager.post(parseRequest('a')),
      manager.post(parseRequest('b')),
    ]);
    // Two concurrent tasks -> two workers created
    expect(FakeRpcWorker.instances).toHaveLength(2);
  });

  it('queues tasks beyond the pool cap and drains the queue', async () => {
    const manager = makeManager(okHandler, 1);
    const results = await Promise.all([
      manager.post(parseRequest('a')),
      manager.post(parseRequest('b')),
      manager.post(parseRequest('c')),
    ]);
    expect(results).toHaveLength(3);
    // Single worker handled all three sequentially
    expect(FakeRpcWorker.instances).toHaveLength(1);
    expect(FakeRpcWorker.instances[0].received).toHaveLength(3);
  });

  it('rejects with AbortError when signal is already aborted', async () => {
    const manager = makeManager();
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.post(parseRequest(), controller.signal),
    ).rejects.toThrow('Aborted');
    // The task never reached a worker
    expect(FakeRpcWorker.instances).toHaveLength(0);
  });

  it('terminates the executing worker when the signal aborts mid-flight', async () => {
    // Handler that never responds — simulates a long parse.
    const manager = makeManager(() => {});
    const controller = new AbortController();

    const promise = manager.post(parseRequest(), controller.signal);
    // Let the task get posted to the worker
    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
    expect(FakeRpcWorker.instances[0].terminated).toBe(true);
  });

  it('replaces a terminated worker for the next task', async () => {
    let firstCall = true;
    const manager = makeManager((req, respond) => {
      if (firstCall) {
        firstCall = false;
        return; // never respond — task will be aborted
      }
      okHandler(req, respond);
    }, 1);

    const controller = new AbortController();
    const aborted = manager.post(parseRequest('a'), controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(aborted).rejects.toThrow('Aborted');

    // Next task gets a fresh worker
    await expect(manager.post(parseRequest('b'))).resolves.toEqual({
      entries: [],
      parseErrors: [],
    });
    expect(FakeRpcWorker.instances).toHaveLength(2);
    expect(FakeRpcWorker.instances[0].terminated).toBe(true);
  });

  it('rejects with the worker-reported error', async () => {
    const manager = makeManager((req, respond) =>
      setTimeout(() => respond({ id: req.id, error: 'parse failed' }), 0),
    );

    await expect(manager.post(parseRequest('bad'))).rejects.toThrow(
      'parse failed',
    );
  });

  it('rejects when the worker emits an error event and discards the worker', async () => {
    const manager = makeManager(() => {});
    const promise = manager.post(parseRequest());
    await Promise.resolve();

    FakeRpcWorker.instances[0].emit('error', { message: 'worker crashed' });

    await expect(promise).rejects.toThrow('worker crashed');
    expect(FakeRpcWorker.instances[0].terminated).toBe(true);
  });

  it('ignores responses with a mismatching request id', async () => {
    const manager = makeManager((req, respond) => {
      setTimeout(() => {
        respond({ id: -999, result: { entries: [], parseErrors: [] } });
        respond({ id: req.id, result: { entries: [], parseErrors: [] } });
      }, 0);
    });

    await expect(manager.post(parseRequest())).resolves.toEqual({
      entries: [],
      parseErrors: [],
    });
  });

  it('dispose() rejects queued tasks and terminates pooled workers', async () => {
    const manager = makeManager(() => {}, 1);
    const inFlight = manager.post(parseRequest('a'));
    const queued = manager.post(parseRequest('b'));
    await Promise.resolve();

    manager.dispose();

    await expect(queued).rejects.toThrow('Aborted');
    expect(FakeRpcWorker.instances[0].terminated).toBe(true);
    // Avoid unhandled rejection noise for the in-flight task: it never
    // settles by design (its worker is gone), so stop awaiting it.
    void inFlight.catch(() => {});
  });

  it('rejects new posts after dispose()', async () => {
    const manager = makeManager();
    manager.dispose();
    await expect(manager.post(parseRequest())).rejects.toThrow('disposed');
  });

  it('defaultPoolSize stays within [1, 3]', () => {
    const size = WorkerManager.defaultPoolSize();
    expect(size).toBeGreaterThanOrEqual(1);
    expect(size).toBeLessThanOrEqual(3);
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
