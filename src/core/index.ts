// Types
export { Author, Entry } from './types/entry';
export type { SearchDocument } from './types/entry';
export { Library } from './types/library';
export {
  type DatabaseType,
  type DatabaseConfig,
  type ReadwiseFilters,
  DATABASE_FORMATS,
  DATABASE_TYPE_LABELS,
  generateDatabaseId,
  findDatabaseById,
  resolveReadwiseFilters,
  resolveZoteroExportNotes,
  resolveZoteroImportAnnotations,
  resolveZoteroApiScope,
} from './types/database';
export type { ZoteroApiScopeConfig } from './types/database';
export type { TemplateContext } from './types/template-context';
export { WORKER_TASK_KINDS } from './types/worker-protocol';
export type {
  ParseErrorInfo,
  WorkerRequest,
  WorkerResponse,
  WorkerTaskKind,
  ParseWorkerRequest,
  ParseWorkerResponse,
  BuildIndexWorkerRequest,
  BuildIndexWorkerResponse,
  WorkerRpcRequest,
  WorkerRpcResponse,
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

// Zotero (Better BibTeX) connector client
export {
  ZoteroConnectorClient,
  ZoteroApiError,
  ZoteroAbortError,
  ZOTERO_ANNOTATION_COLOR_NAMES,
  zoteroColorName,
  normalizeZoteroAttachments,
} from './zotero';
export type {
  ZoteroHttpResponse,
  ZoteroHttpGetFn,
  ZoteroHttpPostFn,
  ZoteroVersions,
  ZoteroAttachmentsFetchResult,
  NormalizedAttachments,
} from './zotero';

// Source-agnostic annotation model (Zotero, Readwise, and future sources all
// normalize into this; consumers read only this interface).
export type { Annotation, AttachmentRef } from './types/annotation';
// Zotero native local API client (Zotero 7+, no Better BibTeX required)
export { ZoteroLocalApiClient, ZOTERO_LOCAL_API_DEFAULT_BASE } from './zotero';
export type {
  ZoteroApiItem,
  ZoteroApiLibraryData,
  ZoteroApiScope,
  ZoteroApiPingResult,
} from './zotero';
export {
  ZoteroApiAdapter,
  buildZoteroApiEntries,
} from './adapters/zotero-api-adapter';
export type { ZoteroApiEntryData } from './adapters/zotero-api-adapter';

// Readwise incremental sync (delta merge)
export {
  mergeReadwiseDelta,
  isMeaningfulHighlight,
  readerChildToItem,
  toEntryDataFromReader,
} from './readwise/readwise-delta';
export type { ReadwiseDeltaInput } from './readwise/readwise-delta';
export type {
  HttpResponse,
  HttpGetFn,
  ReadwiseHighlight,
  ReadwiseExportBook,
  ReadwiseReaderDocument,
} from './readwise/readwise-api-client';

// Entry adapter factory
export { convertToEntries } from './adapters/entry-adapter-factory';

// Parsing
export { loadEntries } from './parsing/entry-parser';

// Note sync (non-destructive note updates: sync blocks + 3-way merge)
export {
  SYNC_BLOCK_ID_PREFIX,
  isValidSyncBlockName,
  parseSyncBlocks,
  hasSyncBlocks,
  buildSyncBlock,
  mergeText,
  lineDiff,
  splitFrontmatter,
  syncFrontmatter,
  planNoteSync,
  baselineFromRender,
  normalizeLineEndings,
  NOTE_UPDATE_MODES,
  NOTE_UPDATE_MODE_LABELS,
  DEFAULT_NOTE_UPDATE_MODE,
  UPDATE_CONFIRMATION_MODES,
  UPDATE_CONFIRMATION_LABELS,
  DEFAULT_UPDATE_CONFIRMATION,
} from './sync';
export type {
  SyncBlock,
  SyncBlockOptions,
  DiffHunk,
  NoteBaseline,
  SyncConflict,
  SyncSummary,
  NoteSyncPlan,
  NoteSyncInput,
  NoteUpdateMode,
  UpdateConfirmationMode,
  NoteReviewItem,
  ReviewDecision,
  IUpdateReviewPresenter,
} from './sync';

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
