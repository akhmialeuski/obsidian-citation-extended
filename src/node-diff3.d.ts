/**
 * Minimal type declarations for `node-diff3` (v3). The package ships types
 * only via the package.json `exports` map, which the project's node10 module
 * resolution does not read — so the two functions used here are declared
 * locally, matching `src/diff3.d.ts` upstream.
 */
declare module 'node-diff3' {
  export interface MergeRegion<T> {
    ok?: T[];
    conflict?: {
      a: T[];
      aIndex: number;
      o: T[];
      oIndex: number;
      b: T[];
      bIndex: number;
    };
  }

  export function diff3Merge<T>(
    a: T[] | string,
    o: T[] | string,
    b: T[] | string,
    options?: {
      excludeFalseConflicts?: boolean;
      stringSeparator?: string | RegExp;
    },
  ): MergeRegion<T>[];

  export interface CommResult<T> {
    common?: T[];
    buffer1?: T[];
    buffer2?: T[];
  }

  export function diffComm<T>(buffer1: T[], buffer2: T[]): CommResult<T>[];
}
