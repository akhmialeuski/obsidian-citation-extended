import { Entry } from '../types/entry';
import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryBibLaTeXAdapter, EntryData } from './biblatex-adapter';
import { EntryDataBibLaTeX } from './biblatex-adapter';
import { EntryCSLAdapter, EntryDataCSL } from './csl-adapter';
import { HayagrivaAdapter, HayagrivaEntryData } from './hayagriva-adapter';
import { UnsupportedFormatError } from '../errors';

/**
 * A registry mapping DatabaseType to an adapter constructor function.
 * Each format's adapter knows how to convert raw EntryData to Entry objects.
 */
const ENTRY_ADAPTERS: Record<DatabaseType, (entries: EntryData[]) => Entry[]> =
  {
    [DATABASE_FORMATS.BibLaTeX]: (entries) =>
      entries.map((e) => new EntryBibLaTeXAdapter(e as EntryDataBibLaTeX)),

    [DATABASE_FORMATS.CslJson]: (entries) =>
      entries.map((e) => new EntryCSLAdapter(e as EntryDataCSL)),

    [DATABASE_FORMATS.Hayagriva]: (entries) =>
      entries.map((e) => {
        const { _hayagrivaCitekey, ...rest } = e as unknown as Record<
          string,
          unknown
        >;
        return new HayagrivaAdapter(
          (_hayagrivaCitekey as string) ?? '',
          rest as HayagrivaEntryData,
        );
      }),
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
