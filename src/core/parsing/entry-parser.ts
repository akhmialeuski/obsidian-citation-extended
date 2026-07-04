import * as BibTeXParser from '@retorquere/bibtex-parser';
import { latex as latexToUnicode } from 'unicode2latex';

import { DatabaseType, DATABASE_FORMATS } from '../types/database';
import { EntryData } from '../adapters/biblatex-adapter';
import { ParseErrorInfo, ParseWorkerResponse } from '../types/worker-protocol';
import { parseHayagrivaYaml } from './hayagriva-parser';

/**
 * Format-specific parser that returns raw entry data and any non-fatal
 * parse errors encountered during parsing.
 */
interface ParseResult {
  entries: EntryData[];
  parseErrors: ParseErrorInfo[];
}

/**
 * Supplementary LaTeX-command → Unicode replacements for command spellings
 * that the unicode2latex `latex` table does not contain (it knows e.g.
 * `\lbrace`/`\ldots` but not the `\textbraceleft`/`\dots` aliases that
 * Zotero/Better BibTeX exports emit). Without these, every occurrence floods
 * the load warnings with "Unhandled command" AND silently drops the glyph
 * from titles/abstracts.
 *
 * Upgrading unicode2latex (3.x → 7.x) was evaluated as the standard fix, but
 * v7 is a breaking API redesign (split table files, different exports), so
 * this small alias table is kept instead.
 *
 * Keys are matched against the trimmed `node.source`, so multi-command
 * sequences (`\cyrchar\cyryat`) are supported. Styling/spacing commands map
 * to an empty string: their arguments are separate AST text nodes and are
 * preserved in the output.
 */
const LATEX_COMMAND_FALLBACKS: Record<string, string> = {
  '\\textbraceleft': '{',
  '\\textbraceright': '}',
  '\\dots': '…',
  '\\textnumero': '№',
  '\\texthorizontalbar': '―', // U+2015 HORIZONTAL BAR (not an em-dash)
  '\\textpm': '±',
  '\\copyright': '©',
  '\\textlnot': '¬',
  '\\textsurd': '√',
  '\\prime': '′', // U+2032 PRIME (not an apostrophe)
  // The parser resolves modern \cyrchar pairs itself, but not the archaic yat.
  '\\cyrchar\\cyryat': 'ѣ',
  '\\cyrchar\\CYRYAT': 'Ѣ',
  // Math styling / spacing / wrapper commands: drop the command itself.
  '\\mathbf': '',
  '\\mathsfbf': '',
  '\\mkern': '',
  '\\ensuremath': '',
};

function parseCslJson(raw: string): ParseResult {
  const data: unknown = JSON.parse(raw);
  return { entries: data as EntryData[], parseErrors: [] };
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
    unknownCommandHandler: (node) => {
      const src = node.source.trim();
      const unicode =
        latexToUnicode[src] ??
        latexToUnicode[`${src}{}`] ??
        LATEX_COMMAND_FALLBACKS[src];
      if (unicode === undefined) {
        // No mapping found — record as non-fatal error (same as errorHandler path)
        // Cannot re-throw: the parser doesn't route unknownCommandHandler throws
        // through errorHandler, it crashes instead.
        const msg = `Unhandled command: ${node.command}`;
        parseErrors.push({ message: msg });
        console.warn(
          'Citation plugin: non-fatal error loading BibLaTeX entry:',
          msg,
        );
      }
      // The parser's Node union isn't directly constructible from external code.
      // This cast is safe: clean_command() returns identical { kind: 'Text' } nodes internally.
      return {
        kind: 'Text',
        value: unicode ?? '',
        loc: node.loc,
        source: unicode ?? '',
      } as unknown as ReturnType<
        NonNullable<
          Exclude<BibTeXParser.ParserOptions['unknownCommandHandler'], false>
        >
      >;
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
  const entries = hayagrivaEntries.map(({ data }) => data as EntryData);
  return { entries, parseErrors: [] };
}

/**
 * Parse a JSON array of pre-processed ReadwiseEntryData objects.
 *
 * ReadwiseSource serializes its API response to JSON before posting to the
 * worker, so the parser simply deserializes the array.
 */
function parseReadwise(raw: string): ParseResult {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) {
    return {
      entries: [],
      parseErrors: [{ message: 'Readwise data is not an array' }],
    };
  }
  return { entries: data as EntryData[], parseErrors: [] };
}

/**
 * Parse a JSON array of pre-built ZoteroApiEntryData DTOs (mirrors the
 * Readwise flow: the source constructs DTOs, serialization is trivial).
 */
function parseZoteroApi(raw: string): ParseResult {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) {
    return {
      entries: [],
      parseErrors: [{ message: 'Zotero API data is not an array' }],
    };
  }
  return { entries: data as EntryData[], parseErrors: [] };
}

/**
 * Maps each DatabaseType to its parser function.
 *
 * Strict `Record<DatabaseType, ...>` — the compiler enforces that every
 * format has a corresponding parser.  Adding a new DatabaseType without
 * registering its parser is a compile-time error.
 */
const FORMAT_PARSERS: Record<DatabaseType, (raw: string) => ParseResult> = {
  [DATABASE_FORMATS.CslJson]: parseCslJson,
  [DATABASE_FORMATS.BibLaTeX]: parseBibLaTeX,
  [DATABASE_FORMATS.Hayagriva]: parseHayagriva,
  [DATABASE_FORMATS.Readwise]: parseReadwise,
  [DATABASE_FORMATS.ZoteroApi]: parseZoteroApi,
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
): ParseWorkerResponse {
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
