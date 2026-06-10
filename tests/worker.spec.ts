/**
 * Unit tests for the worker-side RPC: request dispatch (parse with
 * string/ArrayBuffer payloads, index build) and the id-correlated
 * message loop (success and error envelopes).
 */
import { handleRequest, registerWorkerRpc } from '../src/worker';
import type { WorkerRpcScope } from '../src/worker';
import { WORKER_TASK_KINDS } from '../src/core';
import type {
  ParseWorkerResponse,
  BuildIndexWorkerResponse,
  WorkerRequest,
  WorkerRpcRequest,
  WorkerRpcResponse,
} from '../src/core';
import { loadSearchIndexJson } from '../src/search/search-index';

jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    Platform: { isMobileApp: false },
    normalizePath: (p: string) => p,
  }),
  { virtual: true },
);

const CSL_JSON = JSON.stringify([
  { id: 'entry1', type: 'article-journal', title: 'Tëst Title γ' },
]);

describe('handleRequest', () => {
  it('parses a string payload', () => {
    const response = handleRequest({
      kind: WORKER_TASK_KINDS.Parse,
      databaseRaw: CSL_JSON,
      databaseType: 'csl-json',
    }) as ParseWorkerResponse;

    expect(response.parseErrors).toEqual([]);
    expect(response.entries).toHaveLength(1);
  });

  it('decodes an ArrayBuffer payload as UTF-8 (multi-byte safe)', () => {
    const buffer = new TextEncoder().encode(CSL_JSON).buffer;

    const response = handleRequest({
      kind: WORKER_TASK_KINDS.Parse,
      databaseRaw: buffer,
      databaseType: 'csl-json',
    }) as ParseWorkerResponse;

    expect(response.parseErrors).toEqual([]);
    expect(response.entries).toHaveLength(1);
    // The multi-byte characters survived the in-worker decode.
    expect(JSON.stringify(response.entries[0])).toContain('Tëst Title γ');
  });

  it('builds a loadable search index from documents', async () => {
    const response = handleRequest({
      kind: WORKER_TASK_KINDS.BuildIndex,
      documents: [
        {
          id: 'doc1',
          title: 'Cognitive Architecture',
          authorString: 'Smith, J.',
          year: '2020',
          zoteroId: '',
          notesText: '',
        },
      ],
    }) as BuildIndexWorkerResponse;

    const index = await loadSearchIndexJson(response.indexJson);
    expect(index.search('cognitive').map((r) => r.id as string)).toContain(
      'doc1',
    );
  });

  it('throws on an unknown task kind instead of returning undefined', () => {
    const bogus = { kind: 'bogus' } as unknown as WorkerRequest;
    expect(() => handleRequest(bogus)).toThrow('Unknown worker task kind');
  });
});

describe('registerWorkerRpc', () => {
  function makeScope(): {
    scope: WorkerRpcScope;
    dispatch: (request: WorkerRpcRequest) => void;
    sent: WorkerRpcResponse[];
  } {
    let listener: ((event: MessageEvent<WorkerRpcRequest>) => void) | undefined;
    const sent: WorkerRpcResponse[] = [];
    const scope: WorkerRpcScope = {
      addEventListener: (_type, l) => {
        listener = l;
      },
      postMessage: (message) => {
        sent.push(message);
      },
    };
    return {
      scope,
      sent,
      dispatch: (request) =>
        listener!({ data: request } as MessageEvent<WorkerRpcRequest>),
    };
  }

  it('answers a request with an id-correlated result envelope', () => {
    const { scope, dispatch, sent } = makeScope();
    registerWorkerRpc(scope);

    dispatch({
      id: 7,
      request: {
        kind: WORKER_TASK_KINDS.Parse,
        databaseRaw: CSL_JSON,
        databaseType: 'csl-json',
      },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe(7);
    expect(sent[0].error).toBeUndefined();
    expect((sent[0].result as ParseWorkerResponse).entries).toHaveLength(1);
  });

  it('answers a failing request with an id-correlated error envelope', () => {
    const { scope, dispatch, sent } = makeScope();
    registerWorkerRpc(scope);

    dispatch({
      id: 8,
      request: { kind: 'bogus' } as unknown as WorkerRequest,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe(8);
    expect(sent[0].result).toBeUndefined();
    expect(sent[0].error).toContain('Unknown worker task kind');
  });
});
