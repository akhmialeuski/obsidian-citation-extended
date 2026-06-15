/**
 * Shared helpers for network-backed data sources (Readwise, Zotero). Both fetch
 * over HTTP, cancel in-flight work when the library load aborts, and poll on a
 * configurable interval — this module keeps that machinery in one place.
 */

/**
 * Create an {@link AbortController} that is also aborted when `externalSignal`
 * aborts. Used so a source's in-flight HTTP work stops when the library load is
 * cancelled (load timeout, dispose, or a newer load), instead of leaking.
 *
 * An already-aborted external signal aborts the new controller immediately
 * (an `abort` listener would never fire for it). The listener is registered
 * `once`, and the external signal is per-load and short-lived, so no listeners
 * accumulate.
 */
export function createLinkedAbortController(
  externalSignal?: AbortSignal,
): AbortController {
  const controller = new AbortController();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
  }
  return controller;
}

/**
 * Chained-`setTimeout` poller that re-reads its interval provider on every
 * cycle, so a settings change takes effect on the next cycle without recreating
 * the owning source (which would reset the timer / drop sync continuity).
 *
 * The interval provider returns milliseconds; `<= 0` disables polling. A
 * disabled poller can be re-armed by a later {@link start} call.
 */
export class PeriodicSync {
  private timer: number | null = null;

  /**
   * @param intervalProvider  Returns the current interval in ms (0 = disabled).
   * @param label             Prefix for debug logging.
   */
  constructor(
    private intervalProvider: () => number,
    private label: string,
  ) {}

  /** Begin polling, invoking `callback` each cycle. No-op if already running. */
  start(callback: () => void): void {
    if (this.timer !== null) return;
    this.schedule(callback);
  }

  private schedule(callback: () => void): void {
    const interval = this.intervalProvider();
    if (interval <= 0) {
      this.timer = null;
      return;
    }

    console.debug(
      `${this.label}: next periodic sync in ${Math.round(interval / 60_000)} min`,
    );
    this.timer = window.setTimeout(() => {
      // Re-check at fire time: if disabled since this cycle was armed, stop
      // silently instead of firing one extra sync.
      if (this.intervalProvider() <= 0) {
        this.timer = null;
        return;
      }
      console.debug(`${this.label}: Periodic sync triggered`);
      callback();
      this.schedule(callback);
    }, interval);
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
