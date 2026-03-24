import { HayagrivaEntryData } from '../adapters/hayagriva-adapter';

/**
 * Measure the indentation level of a line (number of leading spaces).
 */
function indentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Parse a simple indented YAML block into a flat key-value object.
 * Handles scalar values, lists, and nested objects (via recursion).
 */
function parseSimpleYamlBlock(lines: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const value = kvMatch[2].trim().replace(/^["']|["']$/g, '');
    const baseIndent = indentLevel(line);

    if (value) {
      data[key] = value;
      i++;
    } else {
      // Collect child lines with deeper indentation
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

      // Determine whether children form a list or a nested object
      const firstContentLine = childLines.find(
        (l) => l.trim() && !l.trim().startsWith('#'),
      );
      if (firstContentLine && firstContentLine.trim().startsWith('- ')) {
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
        data[key] = parseSimpleYamlBlock(childLines);
      }
    }
  }

  return data;
}

/**
 * Parse a Hayagriva YAML string into structured entry objects.
 *
 * Hayagriva files use top-level YAML keys as citekeys with indented
 * fields below each key.  This parser handles the most common
 * Hayagriva patterns without requiring an external YAML library.
 */
export function parseHayagrivaYaml(
  yamlStr: string,
): { citekey: string; data: HayagrivaEntryData }[] {
  const results: { citekey: string; data: HayagrivaEntryData }[] = [];
  const lines = yamlStr.split('\n');
  let currentKey: string | null = null;
  let currentBlock: string[] = [];

  const flushBlock = () => {
    if (currentKey && currentBlock.length > 0) {
      try {
        const raw = parseSimpleYamlBlock(currentBlock);
        // Inject the citekey as `id` so the adapter receives it uniformly
        const data = { id: currentKey, ...raw } as HayagrivaEntryData;
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
    // Top-level key: no indentation, ends with colon, supports dots and hyphens
    if (/^[\w.-]+:\s*$/.test(line)) {
      flushBlock();
      currentKey = line.replace(/:\s*$/, '').trim();
      currentBlock = [];
    } else if (currentKey !== null) {
      currentBlock.push(line);
    }
  }
  flushBlock();

  return results;
}
