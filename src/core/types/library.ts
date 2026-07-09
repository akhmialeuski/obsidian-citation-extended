import { Entry } from './entry';

export class Library {
  constructor(public entries: { [citekey: string]: Entry }) {}

  get size(): number {
    return Object.keys(this.entries).length;
  }

  /**
   * Look up an entry by citekey WITHOUT reading inherited `Object.prototype`
   * members. `entries` is a plain object, so `entries['constructor']` (or any
   * frontmatter-supplied citekey colliding with a prototype member) would
   * otherwise return a function and be mistaken for a real entry.
   */
  getEntry(citekey: string): Entry | undefined {
    return Object.prototype.hasOwnProperty.call(this.entries, citekey)
      ? this.entries[citekey]
      : undefined;
  }
}
