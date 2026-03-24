import { Entry } from '../types/entry';
import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryBibLaTeXAdapter, EntryData } from './biblatex-adapter';
import { EntryDataBibLaTeX } from './biblatex-adapter';
import { EntryCSLAdapter, EntryDataCSL } from './csl-adapter';
import { HayagrivaAdapter, HayagrivaEntryData } from './hayagriva-adapter';
import { UnsupportedFormatError } from '../errors';

/**
 * A registry mapping each DatabaseType to a function that wraps raw
 * EntryData objects in the appropriate typed adapter.
 *
 * Every format follows the same pattern: cast the raw object to the
 * format-specific interface and pass it to the adapter constructor.
 */
const ENTRY_ADAPTERS: Record<DatabaseType, (entries: EntryData[]) => Entry[]> =
  {
    [DATABASE_FORMATS.BibLaTeX]: (entries) =>
      entries.map((e) => new EntryBibLaTeXAdapter(e as EntryDataBibLaTeX)),

    [DATABASE_FORMATS.CslJson]: (entries) =>
      entries.map((e) => new EntryCSLAdapter(e as EntryDataCSL)),

    [DATABASE_FORMATS.Hayagriva]: (entries) =>
      entries.map((e) => new HayagrivaAdapter(e as HayagrivaEntryData)),
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
