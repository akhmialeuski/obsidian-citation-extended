import * as BibTeXParser from '@retorquere/bibtex-parser';

import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryData } from '../adapters/biblatex-adapter';
import { ParseErrorInfo, WorkerResponse } from '../types/worker-protocol';
import { parseHayagrivaYaml } from '../adapters/hayagriva-adapter';

/**
 * Load reference entries from the given raw database data.
 *
 * Returns a list of `EntryData`, which should be wrapped with the relevant
 * adapter and used to instantiate a `Library`.
 */
export function loadEntries(
  databaseRaw: string,
  databaseType: DatabaseType,
): WorkerResponse {
  let libraryArray: EntryData[] = [];
  const parseErrors: ParseErrorInfo[] = [];

  if (databaseType === DATABASE_FORMATS.CslJson) {
    libraryArray = JSON.parse(databaseRaw);
  } else if (databaseType === DATABASE_FORMATS.BibLaTeX) {
    const options: BibTeXParser.ParserOptions = {
      errorHandler: (err) => {
        const msg = String(err);
        parseErrors.push({ message: msg });
        console.warn(
          'Citation plugin: non-fatal error loading BibLaTeX entry:',
          err,
        );
      },
    };

    const parsed = BibTeXParser.parse(databaseRaw, options);

    parsed.errors.forEach((error) => {
      const msg = `Fatal error (line ${error.line}, column ${error.column}): ${error.message}`;
      parseErrors.push({ message: msg });
      console.error(
        `Citation plugin: fatal error loading BibLaTeX entry` +
          ` (line ${error.line}, column ${error.column}):`,
        error.message,
      );
    });

    libraryArray = parsed.entries;
  } else if (databaseType === DATABASE_FORMATS.Hayagriva) {
    try {
      const hayagrivaEntries = parseHayagrivaYaml(databaseRaw);
      // Convert Hayagriva entries to EntryData-compatible objects
      // The library builder will wrap them with the appropriate adapter
      libraryArray = hayagrivaEntries.map(
        ({ citekey, data }) =>
          ({
            _hayagrivaCitekey: citekey,
            ...data,
          }) as unknown as EntryData,
      );
    } catch (e) {
      const msg = `Hayagriva parse error: ${(e as Error).message}`;
      parseErrors.push({ message: msg });
      console.error('Citation plugin: failed to parse Hayagriva file:', e);
    }
  }

  return { entries: libraryArray, parseErrors };
}
