import registerPromiseWorker from 'promise-worker/register';

import { loadEntries, WorkerRequest, WorkerResponse } from './types';

registerPromiseWorker((msg: WorkerRequest): WorkerResponse => {
  return loadEntries(msg.databaseRaw, msg.databaseType);
});
