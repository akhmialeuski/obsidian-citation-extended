/**
 * Strategy for merging entries when multiple sources have the same citekey
 */
export enum MergeStrategy {
  /**
   * Last source wins in case of citekey conflicts
   * Sources are processed in order, later sources override earlier ones
   */
  LastWins = 'last-wins',

  /**
   * First source wins in case of citekey conflicts
   * First occurrence of a citekey is kept, subsequent ones are ignored
   */
  FirstWins = 'first-wins',

  /**
   * Merge by most recent modification date
   * Requires sources to provide modification timestamps
   */
  MostRecent = 'most-recent',
}
