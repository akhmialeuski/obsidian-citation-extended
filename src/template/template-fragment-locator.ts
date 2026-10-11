import Handlebars from 'handlebars';

/**
 * Finds the part of a Handlebars template that produced a piece of rendered
 * note text. The template is split into line units (a top-level block
 * statement stays one unit), every unit is rendered on its own, and each
 * selected line is matched to the unit whose output line it resembles most.
 */

/** Template lines that produced a selection, line numbers 1-based and inclusive. */
export interface TemplateFragmentMatch {
  template: string;
  firstLine: number;
  lastLine: number;
}

/** Renders one piece of template source, or returns null when it fails to render. */
export type TemplateUnitRenderer = (source: string) => string | null;

interface TemplateUnit {
  firstLine: number;
  lastLine: number;
  outputLines: Set<string>[];
}

/** Callout quote markers and bullets differ between note and template output. */
const LINE_PREFIX_RE = /^\s*(?:>\s*)*/;
const TOKEN_SEPARATOR_RE = /[\s()[\]"]+/;

function tokens(line: string): Set<string> {
  return new Set(
    line
      .replace(LINE_PREFIX_RE, '')
      .split(TOKEN_SEPARATOR_RE)
      .filter((token) => token !== ''),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Locate the template lines that produced `selection`.
 *
 * @returns The matching lines of `template`, or null when the template does
 *   not parse or no selected line resembles any rendered unit.
 */
export function locateTemplateFragment(
  template: string,
  selection: string,
  render: TemplateUnitRenderer,
): TemplateFragmentMatch | null {
  let program: hbs.AST.Program;
  try {
    program = Handlebars.parse(template);
  } catch {
    return null;
  }

  // Line ranges of top-level block statements, merged where two blocks
  // share a line (`{{/if}}{{#each}}`), so no block is cut in the middle.
  const ranges: [number, number][] = [];
  for (const node of program.body) {
    if (node.type !== 'BlockStatement' || !node.loc) continue;
    const range: [number, number] = [node.loc.start.line, node.loc.end.line];
    const last = ranges[ranges.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else ranges.push(range);
  }

  const lines = template.split('\n');
  const units: TemplateUnit[] = [];
  let line = 1;
  while (line <= lines.length) {
    const block = ranges.find(([start]) => start === line);
    const lastLine = block ? block[1] : line;
    const source = lines.slice(line - 1, lastLine).join('\n');
    if (source.trim() !== '') {
      units.push({
        firstLine: line,
        lastLine,
        outputLines: (render(source) ?? '').split('\n').map(tokens),
      });
    }
    line = lastLine + 1;
  }

  // Each selected line votes for the unit holding its most similar output line.
  const chosen: number[] = [];
  for (const selected of selection.split('\n')) {
    const wanted = tokens(selected);
    if (wanted.size === 0) continue;
    let best = -1;
    let bestScore = 0;
    units.forEach((unit, index) => {
      for (const output of unit.outputLines) {
        const score = similarity(wanted, output);
        if (score > bestScore) {
          bestScore = score;
          best = index;
        }
      }
    });
    if (best !== -1) chosen.push(best);
  }
  if (chosen.length === 0) return null;

  const firstLine = units[Math.min(...chosen)].firstLine;
  const lastLine = units[Math.max(...chosen)].lastLine;
  return {
    template: lines.slice(firstLine - 1, lastLine).join('\n'),
    firstLine,
    lastLine,
  };
}
