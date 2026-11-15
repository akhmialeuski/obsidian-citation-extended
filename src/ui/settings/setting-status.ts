/**
 * Status lines under a settings control, such as the result of "Test connection" or a path check. Their size and
 * their colour per state live in the plugin stylesheet, so themes can restyle them and no style is set inline.
 */

/** Class every status line carries, sizing it in `styles/styles.css`. */
export const SETTING_STATUS_CLASS = 'citation-setting-status';

/** The state a status line shows, each a class the stylesheet colours. */
export const SETTING_STATUS_KINDS = {
  /** Work in progress or neutral information. */
  Muted: 'is-muted',
  /** The check or the action succeeded. */
  Success: 'is-ok',
  /** Succeeded with something the user should look at. */
  Warning: 'is-warning',
  /** The check or the action failed. */
  Error: 'is-error',
} as const;

/** One status state (derived from {@link SETTING_STATUS_KINDS}). */
export type SettingStatusKind =
  (typeof SETTING_STATUS_KINDS)[keyof typeof SETTING_STATUS_KINDS];

/** Show `kind` on a status line, replacing whichever state it showed before. */
export function setSettingStatus(
  el: HTMLElement,
  kind: SettingStatusKind,
): void {
  el.classList.remove(...Object.values(SETTING_STATUS_KINDS));
  el.classList.add(kind);
}
