/**
 * HTTP client for a locally running Zotero with the Better BibTeX (BBT)
 * extension. Pure TypeScript — no Obsidian dependencies; network I/O is
 * delegated to injected transport functions so the host can wrap its own HTTP
 * stack (e.g. Obsidian's `requestUrl`).
 *
 * Two BBT facilities are used, both documented and stable:
 *
 * - **Pull export** (`GET .../better-bibtex/collection?<id>.<format>`): returns
 *   the full bibliography of a library/collection in a translator format the
 *   plugin already parses (Better CSL JSON or BibLaTeX). Optionally includes
 *   Zotero notes and PDF annotations via `&exportNotes=true`.
 * - **JSON-RPC** (`POST .../better-bibtex/json-rpc`): `api.ready` reports the
 *   Zotero and BBT versions, used for a "Test connection" probe.
 *
 * @see https://retorque.re/zotero-better-bibtex/exporting/pull/
 * @see https://retorque.re/zotero-better-bibtex/exporting/json-rpc/
 */

/** Minimal HTTP response surface used by the Zotero client. */
export interface ZoteroHttpResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** Performs an HTTP GET and resolves to a {@link ZoteroHttpResponse}. */
export type ZoteroHttpGetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<ZoteroHttpResponse>;

/** Performs an HTTP POST and resolves to a {@link ZoteroHttpResponse}. */
export type ZoteroHttpPostFn = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<ZoteroHttpResponse>;

/** Error thrown by {@link ZoteroConnectorClient} on connection/API failures. */
export class ZoteroApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ZoteroApiError';
  }
}

/** Reported by {@link ZoteroConnectorClient.ping} (BBT `api.ready`). */
export interface ZoteroVersions {
  zotero: string;
  betterbibtex: string;
}

/** Result of a bulk `item.attachments` fetch. */
export interface ZoteroAttachmentsFetchResult {
  /** Citekey → raw `item.attachments` result (array of attachment DTOs). */
  attachmentsByCitekey: Map<string, unknown[]>;
  /** Per-citekey JSON-RPC errors (e.g. citekey not found). Non-fatal. */
  errors: Array<{ citekey: string; message: string }>;
}

/** Thrown when an in-flight request is cancelled via its AbortSignal. */
export class ZoteroAbortError extends Error {
  constructor() {
    super('Zotero request aborted');
    this.name = 'ZoteroAbortError';
  }
}

export class ZoteroConnectorClient {
  /**
   * @param pullUrl  The Better BibTeX pull-export URL copied from Zotero via
   *                 "Download Better BibTeX export…" — e.g.
   *                 `http://127.0.0.1:23119/better-bibtex/collection?/0/ABCD1234.json`.
   *                 Its origin is reused for the JSON-RPC endpoint.
   */
  constructor(
    private pullUrl: string,
    private get: ZoteroHttpGetFn,
    private post: ZoteroHttpPostFn,
  ) {}

  /**
   * Fetch the full bibliography from the configured pull-export URL.
   *
   * @param exportNotes  Append `&exportNotes=true` so Zotero notes and PDF
   *                     annotations are included in the export.
   * @returns The raw export body (Better CSL JSON or BibLaTeX text).
   */
  async fetchBibliography(opts?: {
    exportNotes?: boolean;
    signal?: AbortSignal;
  }): Promise<string> {
    this.throwIfAborted(opts?.signal);

    const url = this.buildPullUrl(opts?.exportNotes ?? false);
    let response: ZoteroHttpResponse;
    try {
      response = await this.get(url, {
        Accept: 'application/json, text/plain',
      });
    } catch (e) {
      throw new ZoteroApiError(
        `Could not reach Zotero at ${this.safeOrigin()}. Is Zotero running with the Better BibTeX extension? (${
          e instanceof Error ? e.message : String(e)
        })`,
      );
    }

    this.throwIfAborted(opts?.signal);

    if (response.status < 200 || response.status >= 300) {
      throw new ZoteroApiError(
        `Zotero pull export failed with HTTP ${response.status}. ` +
          'Check that the export URL is correct and the collection still exists.',
        response.status,
      );
    }

    const body = await response.text();
    if (!body || body.trim().length === 0) {
      throw new ZoteroApiError(
        'Zotero pull export returned an empty response.',
        response.status,
      );
    }
    return body;
  }

  /**
   * Probe the BBT JSON-RPC `api.ready` method, returning the Zotero and BBT
   * versions. Used by the settings "Test connection" button.
   */
  async ping(signal?: AbortSignal): Promise<ZoteroVersions> {
    this.throwIfAborted(signal);

    const url = this.jsonRpcUrl();
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'api.ready',
      params: [],
      id: 1,
    });

    let response: ZoteroHttpResponse;
    try {
      response = await this.post(url, requestBody, {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
    } catch (e) {
      throw new ZoteroApiError(
        `Could not reach Zotero at ${this.safeOrigin()}. Is Zotero running with the Better BibTeX extension? (${
          e instanceof Error ? e.message : String(e)
        })`,
      );
    }

    this.throwIfAborted(signal);

    if (response.status < 200 || response.status >= 300) {
      throw new ZoteroApiError(
        `Zotero JSON-RPC returned HTTP ${response.status}.`,
        response.status,
      );
    }

    const payload = (await response.json()) as {
      result?: { zotero?: string; betterbibtex?: string };
      error?: { message?: string };
    };
    if (payload.error) {
      throw new ZoteroApiError(
        `Zotero JSON-RPC error: ${payload.error.message ?? 'unknown'}`,
      );
    }
    return {
      zotero: payload.result?.zotero ?? 'unknown',
      betterbibtex: payload.result?.betterbibtex ?? 'unknown',
    };
  }

  /** Citekeys per JSON-RPC batch POST — bounded so huge libraries don't build megabyte request bodies. */
  private static readonly ATTACHMENTS_BATCH_SIZE = 50;

  /**
   * Fetch attachments (with native PDF annotations) for many citekeys via
   * batched JSON-RPC `item.attachments` calls.
   *
   * BBT answers each request in the batch independently, so a citekey that
   * cannot be resolved yields a per-key error while the rest still succeed.
   * Transport-level failures (Zotero closed, HTTP error) throw
   * {@link ZoteroApiError} — callers should treat annotation enrichment as
   * optional and degrade gracefully.
   */
  async fetchAttachmentsForCitekeys(
    citekeys: string[],
    opts?: { signal?: AbortSignal },
  ): Promise<ZoteroAttachmentsFetchResult> {
    const attachmentsByCitekey = new Map<string, unknown[]>();
    const errors: Array<{ citekey: string; message: string }> = [];
    if (citekeys.length === 0) {
      return { attachmentsByCitekey, errors };
    }

    const url = this.jsonRpcUrl();
    const batchSize = ZoteroConnectorClient.ATTACHMENTS_BATCH_SIZE;

    for (let start = 0; start < citekeys.length; start += batchSize) {
      this.throwIfAborted(opts?.signal);
      const chunk = citekeys.slice(start, start + batchSize);
      const requestBody = JSON.stringify(
        chunk.map((citekey, i) => ({
          jsonrpc: '2.0',
          method: 'item.attachments',
          params: [citekey],
          id: start + i,
        })),
      );

      let response: ZoteroHttpResponse;
      try {
        response = await this.post(url, requestBody, {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        });
      } catch (e) {
        throw new ZoteroApiError(
          `Could not reach Zotero at ${this.safeOrigin()} while fetching annotations. (${
            e instanceof Error ? e.message : String(e)
          })`,
        );
      }

      this.throwIfAborted(opts?.signal);

      if (response.status < 200 || response.status >= 300) {
        throw new ZoteroApiError(
          `Zotero JSON-RPC returned HTTP ${response.status} while fetching annotations.`,
          response.status,
        );
      }

      const payload = await response.json();
      // A single-element batch may be answered with a bare object.
      const results = Array.isArray(payload) ? payload : [payload];
      for (const entry of results) {
        const item = entry as {
          id?: unknown;
          result?: unknown;
          error?: { message?: string };
        };
        const index = typeof item.id === 'number' ? item.id : NaN;
        const citekey = citekeys[index];
        if (citekey === undefined) continue;
        if (item.error) {
          errors.push({
            citekey,
            message: item.error.message ?? 'unknown JSON-RPC error',
          });
          continue;
        }
        attachmentsByCitekey.set(
          citekey,
          Array.isArray(item.result) ? item.result : [],
        );
      }
    }

    return { attachmentsByCitekey, errors };
  }

  /** Append the `exportNotes` flag to the pull URL without clobbering existing query params. */
  private buildPullUrl(exportNotes: boolean): string {
    if (!exportNotes) return this.pullUrl;
    const separator = this.pullUrl.includes('?') ? '&' : '?';
    return `${this.pullUrl}${separator}exportNotes=true`;
  }

  /** Derive the JSON-RPC endpoint from the pull URL's origin. */
  private jsonRpcUrl(): string {
    let origin: string;
    try {
      origin = new URL(this.pullUrl).origin;
    } catch {
      throw new ZoteroApiError(`Invalid Zotero export URL: "${this.pullUrl}".`);
    }
    return `${origin}/better-bibtex/json-rpc`;
  }

  /** Best-effort origin for error messages; falls back to the raw URL. */
  private safeOrigin(): string {
    try {
      return new URL(this.pullUrl).origin;
    } catch {
      return this.pullUrl;
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new ZoteroAbortError();
  }
}
