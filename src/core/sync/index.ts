export {
  SYNC_BLOCK_ID_PREFIX,
  SYNC_BLOCK_NAME_RE,
  isValidSyncBlockName,
  parseSyncBlocks,
  hasSyncBlocks,
  buildSyncBlock,
} from './sync-blocks';
export type { SyncBlock, SyncBlockOptions } from './sync-blocks';
export { mergeText, lineDiff } from './merge3';
export type { Merge3Result, DiffHunk } from './merge3';
export {
  splitFrontmatter,
  parseKeyBlocks,
  syncFrontmatter,
} from './frontmatter-sync';
export type {
  FrontmatterSplit,
  KeyBlocks,
  FrontmatterConflict,
  FrontmatterSyncResult,
} from './frontmatter-sync';
export { planNoteSync } from './note-sync';
export type {
  NoteBaseline,
  SyncConflict,
  SyncSummary,
  NoteSyncPlan,
  NoteSyncInput,
} from './note-sync';
export {
  NOTE_UPDATE_MODES,
  NOTE_UPDATE_MODE_LABELS,
  DEFAULT_NOTE_UPDATE_MODE,
  UPDATE_CONFIRMATION_MODES,
  UPDATE_CONFIRMATION_LABELS,
  DEFAULT_UPDATE_CONFIRMATION,
} from './note-update-mode';
export type {
  NoteUpdateMode,
  UpdateConfirmationMode,
} from './note-update-mode';
