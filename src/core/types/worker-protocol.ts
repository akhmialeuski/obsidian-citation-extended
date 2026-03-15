import { EntryData } from '../adapters/biblatex-adapter';
import { DatabaseType } from './database';

export interface ParseErrorInfo {
  message: string;
}

export interface WorkerRequest {
  databaseRaw: string;
  databaseType: DatabaseType;
}

export interface WorkerResponse {
  entries: EntryData[];
  parseErrors: ParseErrorInfo[];
}
