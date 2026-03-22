import type {
  IBatchNoteOrchestrator,
  BatchUpdateResult,
} from './batch-update.types';

const NOT_IMPLEMENTED = 'BatchNoteOrchestrator is not yet implemented.';

/**
 * Stub orchestrator for batch note updates.
 *
 * This class defines the contract and will be implemented in a future
 * iteration.  All methods throw until a real implementation is provided.
 */
export class BatchNoteOrchestrator implements IBatchNoteOrchestrator {
  preview(
    ...args: Parameters<IBatchNoteOrchestrator['preview']>
  ): Promise<BatchUpdateResult> {
    void args;
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  execute(
    ...args: Parameters<IBatchNoteOrchestrator['execute']>
  ): Promise<BatchUpdateResult> {
    void args;
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }
}
