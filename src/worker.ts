import registerPromiseWorker from 'promise-worker/register';

import { loadEntries, WorkerRequest, WorkerResponse } from './core';

registerPromiseWorker((msg: WorkerRequest): WorkerResponse => {
  return loadEntries(msg.databaseRaw, msg.databaseType);
});
