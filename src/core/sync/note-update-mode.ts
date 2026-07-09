/**
 * Note update policy types, shared by the notes layer (orchestrator) and the
 * UI layer (settings) without either depending on the other.
 */

export const NOTE_UPDATE_MODES = ['sync', 'frontmatter', 'overwrite'] as const;

/** How note updates treat existing notes. */
export type NoteUpdateMode = (typeof NOTE_UPDATE_MODES)[number];

/** Human-readable labels for the settings dropdown. */
export const NOTE_UPDATE_MODE_LABELS: Record<NoteUpdateMode, string> = {
  sync: 'Smart sync (callout blocks + 3-way merge)',
  frontmatter: 'Update frontmatter only',
  overwrite: 'Overwrite notes completely',
};

/** Default mode: merge, never destroy. */
export const DEFAULT_NOTE_UPDATE_MODE: NoteUpdateMode = 'sync';

export const UPDATE_CONFIRMATION_MODES = [
  'conflicts',
  'always',
  'never',
] as const;

/** When the review dialog is shown before writing. */
export type UpdateConfirmationMode = (typeof UPDATE_CONFIRMATION_MODES)[number];

/** Labels for the confirmation dropdown. */
export const UPDATE_CONFIRMATION_LABELS: Record<
  UpdateConfirmationMode,
  string
> = {
  conflicts: 'Only when there are conflicts',
  always: 'Before every change',
  never: 'Never (conflicted notes are skipped)',
};

/** Default: review only what actually needs a decision. */
export const DEFAULT_UPDATE_CONFIRMATION: UpdateConfirmationMode = 'conflicts';
