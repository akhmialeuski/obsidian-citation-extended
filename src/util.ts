import type {
  ParseWorkerResponse,
  WorkerRequest,
  WorkerResponse,
  WorkerRpcResponse,
} from './core';

export const DISALLOWED_FILENAME_CHARACTERS_RE = /[*"\\/<>:|?]/g;

/**
 * Characters disallowed inside a single filename segment.
 * Unlike {@link DISALLOWED_FILENAME_CHARACTERS_RE}, this does NOT include
 * the forward-slash `/`, so that path separators produced by title templates
 * (e.g. `{{containerTitle}}/{{citekey}}`) are preserved.
 */
export const DISALLOWED_SEGMENT_CHARACTERS_RE = /[*"\\<>:|?]/g;

/** A pooled worker with its busy flag. */
interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

/** A queued task awaiting a free worker. */
interface PendingTask {
  request: WorkerRequest;
  transfer?: Transferable[];
  signal?: AbortSignal;
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error | DOMException) => void;
}

/**
 * Manages a small pool of Web Workers with a minimal id-correlated RPC.
 *
 * Replaces the previous single-worker FIFO built on `promise-worker`, which
 * could not provide three properties this plugin needs:
 *
 * 1. **Parallel parsing** — multiple databases parse concurrently instead of
 *    queueing behind each other (load time = max, not sum).
 * 2. **Real cancellation** — aborting a task terminates its worker, so an
 *    abandoned parse stops burning CPU immediately instead of running to
 *    completion and blocking the queue (the old "retry storm" hazard).
 * 3. **Transferable payloads** — large file buffers move zero-copy into the
 *    worker instead of being structured-cloned.
 *
 * Workers are created lazily up to `maxWorkers` and replaced transparently
 * after termination or error.
 */
export class WorkerManager {
  private pool: PoolWorker[] = [];
  private queue: PendingTask[] = [];
  private nextRequestId = 1;
  private disposed = false;

  constructor(
    private createWorker: () => Worker,
    private maxWorkers: number = WorkerManager.defaultPoolSize(),
  ) {}

  /**
   * Default pool size: leave headroom for the main thread, cap at 3 — beyond
   * that the parses are I/O-starved rather than CPU-bound in practice.
   */
  static defaultPoolSize(): number {
    const cores =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;
    return Math.max(1, Math.min(3, cores - 1));
  }

  /**
   * Post a request to a pooled worker.
   *
   * @param msg      The worker request (parse / build-index).
   * @param signal   Optional AbortSignal. Aborting TERMINATES the executing
   *                 worker (real cancellation) and rejects with AbortError.
   * @param transfer Optional transferable objects (e.g. the ArrayBuffer
   *                 inside a parse request) moved zero-copy to the worker.
   */
  async post<TResult extends WorkerResponse = ParseWorkerResponse>(
    msg: WorkerRequest,
    signal?: AbortSignal,
    transfer?: Transferable[],
  ): Promise<TResult> {
    if (this.disposed) {
      throw new Error('WorkerManager is disposed');
    }
    return new Promise<TResult>((resolve, reject) => {
      this.queue.push({
        request: msg,
        transfer,
        signal,
        resolve: resolve as (value: WorkerResponse) => void,
        reject,
      });
      this.pump();
    });
  }

  /** Assign queued tasks to idle workers, growing the pool up to the cap. */
  private pump(): void {
    while (this.queue.length > 0) {
      // Drop already-aborted tasks BEFORE acquiring (or creating) a worker.
      if (this.queue[0].signal?.aborted) {
        const aborted = this.queue.shift()!;
        aborted.reject(new DOMException('Aborted', 'AbortError'));
        continue;
      }

      const idle = this.pool.find((w) => !w.busy) ?? this.tryGrowPool();
      if (!idle) return; // all workers busy and pool at capacity

      this.run(idle, this.queue.shift()!);
    }
  }

  private tryGrowPool(): PoolWorker | null {
    if (this.pool.length >= this.maxWorkers) return null;
    const pw: PoolWorker = { worker: this.createWorker(), busy: false };
    this.pool.push(pw);
    return pw;
  }

  private run(pw: PoolWorker, task: PendingTask): void {
    pw.busy = true;
    const id = this.nextRequestId++;

    const cleanup = (): void => {
      pw.worker.removeEventListener('message', onMessage);
      pw.worker.removeEventListener('error', onError);
      task.signal?.removeEventListener('abort', onAbort);
    };

    const release = (): void => {
      pw.busy = false;
      this.pump();
    };

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as WorkerRpcResponse | undefined;
      if (!data || data.id !== id) return;
      cleanup();
      if (data.error !== undefined) {
        task.reject(new Error(data.error));
      } else {
        task.resolve(data.result as WorkerResponse);
      }
      release();
    };

    const onError = (event: ErrorEvent): void => {
      cleanup();
      task.reject(new Error(event.message || 'Worker error'));
      // The worker may be wedged — discard it; the pool regrows lazily.
      this.discard(pw);
      this.pump();
    };

    const onAbort = (): void => {
      cleanup();
      task.reject(new DOMException('Aborted', 'AbortError'));
      // Real cancellation: terminating the worker stops the in-flight parse
      // immediately instead of letting it run to completion in the dark.
      this.discard(pw);
      this.pump();
    };

    pw.worker.addEventListener('message', onMessage);
    pw.worker.addEventListener('error', onError as EventListener);
    task.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      pw.worker.postMessage({ id, request: task.request }, task.transfer ?? []);
    } catch (e) {
      cleanup();
      task.reject(e instanceof Error ? e : new Error(String(e)));
      release();
    }
  }

  /** Terminate a worker and drop it from the pool. */
  private discard(pw: PoolWorker): void {
    pw.worker.terminate();
    const index = this.pool.indexOf(pw);
    if (index >= 0) this.pool.splice(index, 1);
  }

  /**
   * Dispose the manager: reject queued tasks and terminate all workers.
   */
  dispose(): void {
    this.disposed = true;
    for (const task of this.queue) {
      task.reject(new DOMException('Aborted', 'AbortError'));
    }
    this.queue.length = 0;
    for (const pw of this.pool) {
      pw.worker.terminate();
    }
    this.pool.length = 0;
  }
}
