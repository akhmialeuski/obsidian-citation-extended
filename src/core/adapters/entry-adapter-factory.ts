import { Entry } from '../types/entry';
import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryBibLaTeXAdapter, EntryData } from './biblatex-adapter';
import { EntryDataBibLaTeX } from './biblatex-adapter';
import { EntryCSLAdapter, EntryDataCSL } from './csl-adapter';
import { HayagrivaAdapter, HayagrivaEntryData } from './hayagriva-adapter';
import { ReadwiseAdapter, ReadwiseEntryData } from './readwise-adapter';
import { UnsupportedFormatError } from '../errors';

/**
 * Maps each DatabaseType to the function that wraps raw EntryData objects
 * in the appropriate typed adapter.
 *
 * Strict `Record<DatabaseType, ...>` — the compiler enforces that every
 * format has a corresponding adapter factory.  Adding a new DatabaseType
 * without registering its adapter is a compile-time error.
 */
const ENTRY_ADAPTERS: Record<DatabaseType, (entries: EntryData[]) => Entry[]> =
  {
    [DATABASE_FORMATS.BibLaTeX]: (entries) =>
      entries.map((e) => new EntryBibLaTeXAdapter(e as EntryDataBibLaTeX)),

    [DATABASE_FORMATS.CslJson]: (entries) =>
      entries.map((e) => new EntryCSLAdapter(e as EntryDataCSL)),

    [DATABASE_FORMATS.Hayagriva]: (entries) =>
      entries.map((e) => new HayagrivaAdapter(e as HayagrivaEntryData)),

    [DATABASE_FORMATS.Readwise]: (entries) =>
      entries.map((e) => new ReadwiseAdapter(e as ReadwiseEntryData)),
  };

/**
 * Convert raw EntryData to typed Entry objects using the adapter for the
 * given bibliography format.
 *
 * @throws {UnsupportedFormatError} when `format` is not a known DatabaseType.
 */
export function convertToEntries(
  format: DatabaseType,
  entries: EntryData[],
): Entry[] {
  const adapter = ENTRY_ADAPTERS[format];
  if (!adapter) {
    throw new UnsupportedFormatError(format);
  }
  return adapter(entries);
}
