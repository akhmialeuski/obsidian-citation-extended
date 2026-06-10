import { loadEntries, WORKER_TASK_KINDS } from './core';
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerRpcRequest,
  WorkerRpcResponse,
} from './core';
import { buildSearchIndexJson } from './search/search-index';

/**
 * Dispatch a single worker request.
 *
 * - `parse`: parse a raw bibliography database. An ArrayBuffer payload is
 *   decoded here (UTF-8), so the main thread can transfer the buffer
 *   zero-copy instead of decoding and structured-cloning a large string.
 * - `build-index`: tokenize search documents into a MiniSearch index and
 *   return its JSON serialization, keeping index builds off the main thread.
 */
export function handleRequest(request: WorkerRequest): WorkerResponse {
  switch (request.kind) {
    case WORKER_TASK_KINDS.Parse: {
      const raw =
        typeof request.databaseRaw === 'string'
          ? request.databaseRaw
          : new TextDecoder('utf-8').decode(request.databaseRaw);
      return loadEntries(raw, request.databaseType);
    }
    case WORKER_TASK_KINDS.BuildIndex:
      return { indexJson: buildSearchIndexJson(request.documents) };
    default: {
      // Runtime guard for version-skewed/corrupt messages: surface a clear
      // error envelope instead of resolving the caller with `undefined`.
      const unknownKind = (request as { kind?: string }).kind;
      throw new Error(`Unknown worker task kind: ${String(unknownKind)}`);
    }
  }
}

/** The subset of the worker global scope used by the RPC loop. */
export interface WorkerRpcScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRpcRequest>) => void,
  ): void;
  postMessage(message: WorkerRpcResponse): void;
}

/**
 * Wire the minimal id-correlated RPC over postMessage onto a worker scope
 * (see worker-protocol.ts for the rationale of not using promise-worker).
 * Exported so the loop is unit-testable against a fake scope.
 */
export function registerWorkerRpc(scope: WorkerRpcScope): void {
  scope.addEventListener('message', (event: MessageEvent<WorkerRpcRequest>) => {
    const { id, request } = event.data;
    try {
      scope.postMessage({ id, result: handleRequest(request) });
    } catch (e) {
      scope.postMessage({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

// In the real Web Worker `self` is always defined; the guard only matters in
// unit tests, where this module is imported in a Node context.
if (typeof self !== 'undefined') {
  registerWorkerRpc(self as unknown as WorkerRpcScope);
}
