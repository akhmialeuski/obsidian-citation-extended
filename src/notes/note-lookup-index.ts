import type { IPlatformAdapter } from '../container';
import type { IVaultFile } from '../platform/platform-adapter';

/**
 * Lazy, reusable lookup structures over one vault snapshot.
 *
 * A single note lookup falls through up to four strategies (exact path,
 * case-insensitive path, basename inside the notes folder, basename
 * vault-wide, frontmatter identifier) — each of which used to be its own
 * full `getMarkdownFiles()` scan. A batch update over N citekeys therefore
 * cost O(N × M) file visits. Sharing one index across the batch makes it
 * O(N + M): every map is built at most once, and only when a lookup actually
 * needs it (an exact-path hit builds nothing).
 *
 * The index is a snapshot: create a fresh one per user action, not one per
 * plugin lifetime.
 */
export class NoteLookupIndex {
  private files: IVaultFile[] | null = null;
  private lowerPaths: Map<string, IVaultFile> | null = null;
  private basenames: Map<string, IVaultFile[]> | null = null;
  /** Frontmatter identifier value → first file, for one field name. */
  private identifiers: Map<string, IVaultFile> | null = null;
  private identifierField: string | null = null;

  constructor(private platform: IPlatformAdapter) {}

  private allFiles(): IVaultFile[] {
    return (this.files ??= this.platform.vault.getMarkdownFiles());
  }

  /** File whose lowercased vault path equals `lowerPath`, or null. */
  byLowerPath(lowerPath: string): IVaultFile | null {
    if (!this.lowerPaths) {
      this.lowerPaths = new Map();
      for (const file of this.allFiles()) {
        const key = file.path.toLowerCase();
        if (!this.lowerPaths.has(key)) this.lowerPaths.set(key, file);
      }
    }
    return this.lowerPaths.get(lowerPath) ?? null;
  }

  /** All files with the lowercased basename, in vault enumeration order. */
  byBasename(lowerBasename: string): IVaultFile[] {
    if (!this.basenames) {
      this.basenames = new Map();
      for (const file of this.allFiles()) {
        const key = file.name.toLowerCase();
        const list = this.basenames.get(key);
        if (list) list.push(file);
        else this.basenames.set(key, [file]);
      }
    }
    return this.basenames.get(lowerBasename) ?? [];
  }

  /** First file whose frontmatter `fieldName` equals `citekey`, or null. */
  byIdentifier(fieldName: string, citekey: string): IVaultFile | null {
    if (!this.identifiers || this.identifierField !== fieldName) {
      this.identifierField = fieldName;
      this.identifiers = new Map();
      for (const file of this.allFiles()) {
        const value = this.platform.vault.getFrontmatter(file)?.[fieldName];
        if (
          value != null &&
          (typeof value === 'string' || typeof value === 'number')
        ) {
          const key = String(value);
          if (!this.identifiers.has(key)) this.identifiers.set(key, file);
        }
      }
    }
    return this.identifiers.get(citekey) ?? null;
  }
}
