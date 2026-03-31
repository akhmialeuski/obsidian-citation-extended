// Types
export { Author, Entry } from './types/entry';
export type { SearchDocument } from './types/entry';
export { Library } from './types/library';
export {
  type DatabaseType,
  type DatabaseConfig,
  DATABASE_FORMATS,
  DATABASE_TYPE_LABELS,
  generateDatabaseId,
} from './types/database';
export type { TemplateContext } from './types/template-context';
export type {
  ParseErrorInfo,
  WorkerRequest,
  WorkerResponse,
} from './types/worker-protocol';

// Adapters
export { EntryCSLAdapter, isEntryDataCSL } from './adapters/csl-adapter';
export type { EntryDataCSL } from './adapters/csl-adapter';
export {
  EntryBibLaTeXAdapter,
  EntryDataBibLaTeX,
  isEntryDataBibLaTeX,
} from './adapters/biblatex-adapter';
export type { EntryData } from './adapters/biblatex-adapter';
export { HayagrivaAdapter } from './adapters/hayagriva-adapter';
export type { HayagrivaEntryData } from './adapters/hayagriva-adapter';
export { ReadwiseAdapter } from './adapters/readwise-adapter';
export type {
  ReadwiseEntryData,
  ReadwiseMode,
} from './adapters/readwise-adapter';

// Readwise API client
export {
  ReadwiseApiClient,
  ReadwiseApiError,
} from './readwise/readwise-api-client';
export type {
  ReadwiseHighlight,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from './readwise/readwise-api-client';

// Entry adapter factory
export { convertToEntries } from './adapters/entry-adapter-factory';

// Parsing
export { loadEntries } from './parsing/entry-parser';

// Existing core modules
export { Result, ok, err } from './result';
export {
  CitationError,
  LibraryNotReadyError,
  EntryNotFoundError,
  LiteratureNoteNotFoundError,
  TemplateRenderError,
  DataSourceError,
  UnsupportedFormatError,
  BatchUpdateError,
} from './errors';
