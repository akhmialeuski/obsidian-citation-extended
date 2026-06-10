import { EntryData } from '../adapters/biblatex-adapter';
import { DatabaseType } from './database';
import type { SearchDocument } from './entry';

export interface ParseErrorInfo {
  message: string;
}

/** Named constants for worker task kinds (avoids scattered string literals). */
export const WORKER_TASK_KINDS = {
  Parse: 'parse',
  BuildIndex: 'build-index',
} as const;

export type WorkerTaskKind =
  (typeof WORKER_TASK_KINDS)[keyof typeof WORKER_TASK_KINDS];

/** Parse a raw bibliography database into entry data. */
export interface ParseWorkerRequest {
  kind: typeof WORKER_TASK_KINDS.Parse;
  /**
   * Raw database content. An ArrayBuffer is decoded as UTF-8 inside the
   * worker — callers that already hold a buffer should pass it as a
   * transferable (zero-copy) instead of decoding on the main thread.
   */
  databaseRaw: string | ArrayBuffer;
  databaseType: DatabaseType;
}

/** Build a serialized MiniSearch index from flat search documents. */
export interface BuildIndexWorkerRequest {
  kind: typeof WORKER_TASK_KINDS.BuildIndex;
  documents: SearchDocument[];
}

export type WorkerRequest = ParseWorkerRequest | BuildIndexWorkerRequest;

export interface ParseWorkerResponse {
  entries: EntryData[];
  parseErrors: ParseErrorInfo[];
}

export interface BuildIndexWorkerResponse {
  /** JSON.stringify of the built MiniSearch index (for loadJSONAsync). */
  indexJson: string;
}

export type WorkerResponse = ParseWorkerResponse | BuildIndexWorkerResponse;

// ---------------------------------------------------------------------------
// RPC envelope
// ---------------------------------------------------------------------------
// A minimal id-correlated request/response protocol over Worker.postMessage.
// Hand-rolled deliberately: the previously used `promise-worker` library does
// not support transferable objects, multiple pooled workers, or per-task
// cancellation — all three are required here (see WorkerManager in util.ts).

export interface WorkerRpcRequest {
  id: number;
  request: WorkerRequest;
}

export interface WorkerRpcResponse {
  id: number;
  /** Present on success. */
  result?: WorkerResponse;
  /** Present on failure (Error message text). */
  error?: string;
}
