import PromiseWorker from 'promise-worker';

import { WorkerRequest, WorkerResponse } from './core';

export const DISALLOWED_FILENAME_CHARACTERS_RE = /[*"\\/<>:|?]/g;

/**
 * Manages a Worker, recording its state and optionally preventing
 * message postings before responses to prior messages have been received.
 */
export class WorkerManager {
  private worker = new PromiseWorker(this._worker);
  private queue: Array<() => Promise<unknown>> = [];
  private isProcessing = false;

  constructor(private _worker: Worker) {}

  /**
   * Post a message to the worker.
   * The message will be added to a queue and processed sequentially.
   * If an AbortSignal is provided, the task can be cancelled (ignored) if it hasn't completed.
   */
  async post<TResult = WorkerResponse, TInput = WorkerRequest>(
    msg: TInput,
    signal?: AbortSignal,
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const task = async () => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }

        try {
          // We can't truly "cancel" the worker thread operation once sent,
          // but we can ignore the result if aborted.
          const result = await this.worker.postMessage(msg);

          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
          } else {
            resolve(result);
          }
        } catch (error) {
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
          } else {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      };

      this.queue.push(task);
      void this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          console.error('WorkerManager: Error processing task', e);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Dispose the worker manager: clear pending queue and terminate the worker.
   */
  dispose(): void {
    this.queue.length = 0;
    this.isProcessing = false;
    this._worker.terminate();
  }
}
