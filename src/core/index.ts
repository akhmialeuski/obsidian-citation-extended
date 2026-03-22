// Types
export { Author, Entry } from './types/entry';
export { Library } from './types/library';
export {
  type DatabaseType,
  type DatabaseConfig,
  DATABASE_FORMATS,
  DATABASE_TYPE_LABELS,
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
