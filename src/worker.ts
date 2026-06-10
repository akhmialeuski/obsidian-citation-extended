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
function handleRequest(request: WorkerRequest): WorkerResponse {
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
  }
}

// Minimal id-correlated RPC over postMessage (see worker-protocol.ts for the
// rationale of not using promise-worker).
const workerScope = self as unknown as {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRpcRequest>) => void,
  ): void;
  postMessage(message: WorkerRpcResponse): void;
};

workerScope.addEventListener(
  'message',
  (event: MessageEvent<WorkerRpcRequest>) => {
    const { id, request } = event.data;
    try {
      workerScope.postMessage({ id, result: handleRequest(request) });
    } catch (e) {
      workerScope.postMessage({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
);
