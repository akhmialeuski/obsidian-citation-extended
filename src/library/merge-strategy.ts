/**
 * Strategy for merging entries when multiple sources have the same citekey
 */
export enum MergeStrategy {
  /**
   * Last source wins in case of citekey conflicts
   * Sources are processed in order, later sources override earlier ones
   */
  LastWins = 'last-wins',
}
