import { Notice } from 'obsidian';

import PromiseWorker from 'promise-worker';

import { NoticeExt } from './obsidian-extensions';
import { WorkerRequest, WorkerResponse } from './types';

export const DISALLOWED_FILENAME_CHARACTERS_RE = /[*"\\/<>:|?]/g;

/**
 * Manages a category of notices to be displayed in the UI. Prevents multiple
 * notices being shown at the same time.
 */
export class Notifier {
  static DISAPPEARING_CLASS = 'mod-disappearing';
  currentNotice?: NoticeExt | null;
  mutationObserver?: MutationObserver | null;

  constructor(public defaultMessage: string) {}

  unload(): void {
    this.hide();
  }

  /**
   * @returns true if the notice was shown, and false otherwise
   */
  show(message?: string): boolean {
    message = message || this.defaultMessage;
    if (this.currentNotice) return false;

    this.currentNotice = new Notice(message) as NoticeExt;

    // Set up mutation observer to watch for when the notice disappears.
    this.mutationObserver?.disconnect();
    this.mutationObserver = new MutationObserver((changes, observer) => {
      const isDisappearing = changes.some((change) => {
        const el = change.target as HTMLElement;
        return (
          change.type == 'attributes' &&
          el.hasClass(NoticeExt.DISAPPEARING_CLASS)
        );
      });
      if (isDisappearing) {
        this.currentNotice = null;
        observer.disconnect();
        this.mutationObserver = null;
      }
    });
    this.mutationObserver.observe(this.currentNotice.noticeEl, {
      attributeFilter: ['class'],
    });
    return true;
  }

  hide(): void {
    this.currentNotice?.hide();
    this.mutationObserver?.disconnect();

    this.currentNotice = null;
    this.mutationObserver = null;
  }
}

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
            reject(error);
          }
        }
      };

      this.queue.push(task);
      this.processQueue();
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
}
