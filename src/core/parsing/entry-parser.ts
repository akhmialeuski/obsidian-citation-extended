import * as BibTeXParser from '@retorquere/bibtex-parser';

import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryData } from '../adapters/biblatex-adapter';
import { ParseErrorInfo, WorkerResponse } from '../types/worker-protocol';
import { parseHayagrivaYaml } from './hayagriva-parser';

/**
 * Format-specific parser that returns raw entry data and any non-fatal
 * parse errors encountered during parsing.
 */
interface ParseResult {
  entries: EntryData[];
  parseErrors: ParseErrorInfo[];
}

function parseCslJson(raw: string): ParseResult {
  const entries: EntryData[] = JSON.parse(raw);
  return { entries, parseErrors: [] };
}

function parseBibLaTeX(raw: string): ParseResult {
  const parseErrors: ParseErrorInfo[] = [];

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

  const parsed = BibTeXParser.parse(raw, options);

  for (const error of parsed.errors) {
    const msg = `Fatal error (line ${error.line}, column ${error.column}): ${error.message}`;
    parseErrors.push({ message: msg });
    console.error(
      `Citation plugin: fatal error loading BibLaTeX entry` +
        ` (line ${error.line}, column ${error.column}):`,
      error.message,
    );
  }

  return { entries: parsed.entries, parseErrors };
}

function parseHayagriva(raw: string): ParseResult {
  const hayagrivaEntries = parseHayagrivaYaml(raw);
  // Each entry already has `id` injected by the parser — same as CSL-JSON
  const entries = hayagrivaEntries.map(
    ({ data }) => data as unknown as EntryData,
  );
  return { entries, parseErrors: [] };
}

/** Maps each supported format to its parser function. */
const FORMAT_PARSERS: Record<DatabaseType, (raw: string) => ParseResult> = {
  [DATABASE_FORMATS.CslJson]: parseCslJson,
  [DATABASE_FORMATS.BibLaTeX]: parseBibLaTeX,
  [DATABASE_FORMATS.Hayagriva]: parseHayagriva,
};

/**
 * Load reference entries from the given raw database data.
 *
 * Every format is handled through a consistent pipeline:
 * 1. Look up the parser by format type
 * 2. Run the parser inside a try/catch
 * 3. Collect entries and parse errors uniformly
 */
export function loadEntries(
  databaseRaw: string,
  databaseType: DatabaseType,
): WorkerResponse {
  const parser = FORMAT_PARSERS[databaseType];
  if (!parser) {
    return {
      entries: [],
      parseErrors: [
        { message: `Unsupported database format: "${databaseType}"` },
      ],
    };
  }

  try {
    const result = parser(databaseRaw);
    return { entries: result.entries, parseErrors: result.parseErrors };
  } catch (e) {
    const msg = `${databaseType} parse error: ${(e as Error).message}`;
    console.error(`Citation plugin: failed to parse ${databaseType} file:`, e);
    return { entries: [], parseErrors: [{ message: msg }] };
  }
}
