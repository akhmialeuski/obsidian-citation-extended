import * as BibTeXParser from '@retorquere/bibtex-parser';

import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryData } from '../adapters/biblatex-adapter';
import { ParseErrorInfo, WorkerResponse } from '../types/worker-protocol';

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
  }

  return { entries: libraryArray, parseErrors };
}
