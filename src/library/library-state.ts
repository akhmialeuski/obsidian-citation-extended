/** Lifecycle states of a bibliography library load operation. */
export enum LoadingStatus {
  Idle = 'idle',
  Loading = 'loading',
  Success = 'success',
  Error = 'error',
}

/** Snapshot of the library loading state exposed through {@link LibraryStore}. */
export interface LibraryState {
  status: LoadingStatus;
  progress?: { current: number; total: number };
  error?: Error;
  lastLoaded?: Date;
  /** Every parse error of the load, so `length` is the count shown to the user. */
  parseErrors: string[];
}
