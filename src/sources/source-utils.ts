/**
 * Shared helpers for network-backed data sources (Readwise, Zotero). All fetch
 * over HTTP, cancel in-flight work when the library load aborts, poll on a
 * configurable interval, and keep a versioned JSON offline cache — this module
 * keeps that machinery in one place.
 */

import type { IFileSystem } from '../platform/platform-adapter';

/** Characters not allowed in a cache filename segment. */
const CACHE_NAME_SANITIZE_RE = /[^a-zA-Z0-9_-]/g;

/**
 * Offline-cache filename for a data source, derived from the STABLE database
 * id — never the volatile source key.
 *
 * The source key intentionally changes when a config flag toggles (so the
 * source is recreated), and its shape has also changed across releases;
 * deriving the cache name from it would orphan a perfectly good cache on a
 * flag toggle or an upgrade, silently breaking the "library stays usable
 * offline" guarantee. Keyed by the immutable database id, the cache survives
 * both. Falls back to the source key for a legacy database not yet assigned an
 * id. Returns '' when no cache directory is configured (caching disabled).
 */
export function sourceCacheFilePath(
  cacheDir: string,
  prefix: string,
  databaseId: string | undefined,
  sourceKey: string,
): string {
  if (!cacheDir) return '';
  const stable = (databaseId ?? sourceKey).replace(CACHE_NAME_SANITIZE_RE, '-');
  return `${cacheDir}/${prefix}-${stable}.json`;
}

/**
 * Read a versioned JSON cache file. Returns the parsed state when the file
 * exists, parses, and passes `validate`; otherwise null — a missing,
 * unreadable, or corrupt cache must behave exactly like no cache, so an
 * outage still surfaces as a failure instead of silently replacing the
 * library with an empty "success".
 */
export async function readVersionedJsonCache<T>(
  fileSystem: IFileSystem | undefined,
  cachePath: string | undefined,
  validate: (parsed: unknown) => parsed is T,
): Promise<T | null> {
  if (!fileSystem || !cachePath) return null;
  try {
    if (!(await fileSystem.exists(cachePath))) return null;
    const parsed: unknown = JSON.parse(await fileSystem.readFile(cachePath));
    if (validate(parsed)) return parsed;
  } catch {
    // Missing or corrupt cache behaves exactly like no cache.
  }
  return null;
}

/**
 * Serialize and write a JSON cache file. Best-effort: a failed write keeps
 * the previous cache on disk and is never a load failure.
 */
export async function writeVersionedJsonCache(
  fileSystem: IFileSystem | undefined,
  cachePath: string | undefined,
  state: unknown,
): Promise<void> {
  if (!fileSystem || !cachePath) return;
  try {
    await fileSystem.writeFile(cachePath, JSON.stringify(state));
  } catch {
    // Cache write failure is not critical.
  }
}

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
