import { Author, Entry } from '../types/entry';

/**
 * Raw shape of a Hayagriva YAML entry after parsing.
 * Hayagriva is a YAML-based bibliography format used by Typst.
 * See: https://github.com/typst/hayagriva
 */
export interface HayagrivaEntryData {
  type?: string;
  title?: string;
  author?: (string | { family?: string; given?: string })[];
  editor?: (string | { family?: string; given?: string })[];
  date?: string;
  url?: string;
  doi?: string;
  isbn?: string;
  abstract?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  parent?: {
    type?: string;
    title?: string;
    author?: (string | { family?: string; given?: string })[];
    volume?: string;
    issue?: string;
    publisher?: string;
  };
  language?: string;
  serial?: string;
}

/**
 * Parse a Hayagriva author entry into the standard Author format.
 * Hayagriva authors can be plain strings ("John Doe") or structured objects.
 */
function parseHayagrivaAuthor(
  raw: string | { family?: string; given?: string },
): Author {
  if (typeof raw === 'string') {
    const parts = raw.split(/\s+/);
    if (parts.length === 1) {
      return { literal: raw };
    }
    return {
      given: parts.slice(0, -1).join(' '),
      family: parts[parts.length - 1],
    };
  }
  return { given: raw.given, family: raw.family };
}

/**
 * Parse a Hayagriva date string into a Date object.
 * Hayagriva dates are ISO-like: "2023", "2023-06", "2023-06-15".
 */
function parseHayagrivaDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map((p) => parseInt(p));
  if (parts.length === 0 || isNaN(parts[0])) return null;
  const year = parts[0];
  const month = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 1;
  const day = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export class HayagrivaAdapter extends Entry {
  private _citekey: string;
  private data: HayagrivaEntryData;

  eprint: string | null = null;
  eprinttype: string | null = null;
  files: string[] | null = null;

  _sourceDatabase?: string;
  _compositeCitekey?: string;
  private _id?: string;

  constructor(citekey: string, data: HayagrivaEntryData) {
    super();
    this._citekey = citekey;
    this.data = data;
  }

  get id(): string {
    return this._id || this._citekey;
  }
  set id(value: string) {
    this._id = value;
  }

  get citekey(): string {
    return this._citekey;
  }

  get type(): string {
    return this.data.type || 'article';
  }

  get abstract(): string | undefined {
    return this.data.abstract;
  }

  get author(): Author[] | undefined {
    const authors = this.data.author;
    if (!authors || !Array.isArray(authors)) return undefined;
    return authors.map(parseHayagrivaAuthor);
  }

  get authorString(): string | null {
    const authors = this.author;
    if (!authors) return null;
    return authors
      .map((a) => a.literal || `${a.given || ''} ${a.family || ''}`.trim())
      .join(', ');
  }

  get containerTitle(): string | undefined {
    return this.data.parent?.title;
  }

  get DOI(): string | undefined {
    return this.data.doi;
  }

  get ISBN(): string | undefined {
    return this.data.isbn;
  }

  get issuedDate(): Date | null {
    if (!this.data.date) return null;
    return parseHayagrivaDate(this.data.date);
  }

  get page(): string | undefined {
    return this.data.page;
  }

  get title(): string | undefined {
    return this.data.title;
  }

  get titleShort(): string | undefined {
    return undefined;
  }

  get URL(): string | undefined {
    return this.data.url;
  }

  get publisher(): string | undefined {
    return this.data.publisher || this.data.parent?.publisher;
  }

  get publisherPlace(): string | undefined {
    return undefined;
  }

  get eventPlace(): string | undefined {
    return undefined;
  }

  get language(): string | undefined {
    return this.data.language;
  }

  get source(): string | undefined {
    return undefined;
  }

  get zoteroId(): string | undefined {
    return undefined;
  }

  get keywords(): string[] | undefined {
    return undefined;
  }

  get series(): string | undefined {
    return this.data.serial;
  }

  get volume(): string | undefined {
    return this.data.volume || this.data.parent?.volume;
  }
}

/**
 * Parse a Hayagriva YAML string into EntryData objects.
 * Returns an array of [citekey, data] pairs suitable for adapter instantiation.
 */
export function parseHayagrivaYaml(
  yamlStr: string,
): { citekey: string; data: HayagrivaEntryData }[] {
  // Simple YAML parser — Hayagriva is a flat key-value format.
  // We use a minimal parser to avoid adding a YAML dependency.
  // For full compliance, a proper YAML parser would be needed.
  const results: { citekey: string; data: HayagrivaEntryData }[] = [];
  const lines = yamlStr.split('\n');
  let currentKey: string | null = null;
  let currentBlock: string[] = [];

  const flushBlock = () => {
    if (currentKey && currentBlock.length > 0) {
      try {
        const data = parseSimpleYamlBlock(currentBlock);
        results.push({ citekey: currentKey, data });
      } catch (e) {
        console.warn(
          `Citations plugin: Failed to parse Hayagriva entry "${currentKey}":`,
          e,
        );
      }
    }
  };

  for (const line of lines) {
    // Top-level key (no indentation, ends with colon)
    if (/^[a-zA-Z0-9_-]+:\s*$/.test(line)) {
      flushBlock();
      currentKey = line.replace(':', '').trim();
      currentBlock = [];
    } else if (currentKey !== null) {
      currentBlock.push(line);
    }
  }
  flushBlock();

  return results;
}

/**
 * Parse a simple indented YAML block into a HayagrivaEntryData object.
 * This handles the most common Hayagriva fields without a full YAML parser.
 */
/**
 * Measure the indentation level of a line (number of leading spaces).
 */
function indentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function parseSimpleYamlBlock(lines: string[]): HayagrivaEntryData {
  const data: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Key-value pair at the current indentation level
    const kvMatch = trimmed.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const value = kvMatch[2].trim().replace(/^["']|["']$/g, '');
    const baseIndent = indentLevel(line);

    if (value) {
      // Simple scalar value
      data[key] = value;
      i++;
    } else {
      // Empty value — collect child lines (list or nested object)
      i++;
      const childLines: string[] = [];
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trimStart();
        if (!nextTrimmed || nextTrimmed.startsWith('#')) {
          childLines.push(nextLine);
          i++;
          continue;
        }
        if (indentLevel(nextLine) <= baseIndent) break;
        childLines.push(nextLine);
        i++;
      }

      // Determine whether children are a list or a nested object
      const firstContentLine = childLines.find(
        (l) => l.trim() && !l.trim().startsWith('#'),
      );
      if (firstContentLine && firstContentLine.trim().startsWith('- ')) {
        // List items
        data[key] = childLines
          .filter((l) => l.trim().startsWith('- '))
          .map((l) =>
            l
              .trim()
              .substring(2)
              .trim()
              .replace(/^["']|["']$/g, ''),
          );
      } else {
        // Nested object — recurse
        data[key] = parseSimpleYamlBlock(childLines);
      }
    }
  }

  return data as unknown as HayagrivaEntryData;
}
