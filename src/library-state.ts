export enum LoadingStatus {
  Idle = 'idle',
  Loading = 'loading',
  Success = 'success',
  Error = 'error',
}

export interface LibraryState {
  status: LoadingStatus;
  progress?: { current: number; total: number };
  error?: Error;
  lastLoaded?: Date;
}
