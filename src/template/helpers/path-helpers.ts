import Handlebars from 'handlebars';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

/**
 * Extract the first PDF path from an entry's file list.
 * Returns null if no PDF is found.
 */
function findFirstPdf(files: unknown): string | null {
  if (!Array.isArray(files)) return null;
  for (const f of files) {
    if (typeof f === 'string' && f.toLowerCase().endsWith('.pdf')) {
      return f;
    }
  }
  return null;
}

/**
 * Extract all PDF paths from an entry's file list.
 * Non-PDF attachments (HTML, snapshots, etc.) are excluded.
 */
function findAllPdfs(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  return files.filter(
    (f): f is string =>
      typeof f === 'string' && f.toLowerCase().endsWith('.pdf'),
  );
}

/**
 * Regex matching `storage/<KEY>/` in a Zotero file path.
 * Handles both absolute paths (`/storage/KEY/`) and relative paths
 * (`storage/KEY/`) produced by some Better BibTeX export configurations.
 * The KEY is an alphanumeric Zotero storage identifier (typically 8 chars).
 */
const ZOTERO_STORAGE_KEY_RE = /(?:^|[\\/])storage[\\/]([A-Za-z0-9]+)[\\/]/;

/**
 * Extract the Zotero storage key from a normalized file path.
 * Returns null when the path does not contain a `/storage/<KEY>/` segment.
 */
function extractStorageKey(filePath: string): string | null {
  const match = filePath.match(ZOTERO_STORAGE_KEY_RE);
  return match ? match[1] : null;
}

export function registerPathHelpers(hbs: HandlebarsInstance): void {
  hbs.registerHelper('urlEncode', (value: unknown) => {
    if (typeof value !== 'string') return value;
    return encodeURI(value);
  });
  hbs.registerHelper('basename', (value: string) => {
    if (typeof value !== 'string') return value;
    return value.replace(/^.*[\\/]/, '');
  });
  hbs.registerHelper('filename', (value: string) => {
    if (typeof value !== 'string') return value;
    return value.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
  });
  hbs.registerHelper('dirname', (value: string) => {
    if (typeof value !== 'string') return value;
    return value.replace(/[\\/][^\\/]*$/, '');
  });

  /**
   * Generate a file:// link to the first PDF attachment.
   * Returns an empty string when no PDF is available.
   */
  hbs.registerHelper('pdfLink', (files: unknown) => {
    const pdf = findFirstPdf(files);
    if (!pdf) return '';
    return `file://${encodeURI(pdf)}`;
  });

  /**
   * Generate a Markdown link to the first PDF attachment.
   * Returns an empty string when no PDF is available.
   */
  hbs.registerHelper('pdfMarkdownLink', (files: unknown) => {
    const pdf = findFirstPdf(files);
    if (!pdf) return '';
    const name = pdf.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
    return `[${name}](file://${encodeURI(pdf)})`;
  });

  /**
   * Generate a zotero://open-pdf URI for the first PDF attachment.
   * Extracts the Zotero storage key from the file path.
   * Returns an empty string when no PDF is found or the path has no storage key.
   */
  hbs.registerHelper('zoteroPdfURI', (files: unknown) => {
    const pdf = findFirstPdf(files);
    if (!pdf) return '';
    const key = extractStorageKey(pdf);
    if (!key) return '';
    return `zotero://open-pdf/library/items/${key}`;
  });

  /**
   * Generate zotero://open-pdf URIs for all PDF attachments as an array.
   * Non-PDF attachments are excluded. Entries without a storage key are skipped.
   * Returns an empty array when no valid PDFs are found.
   *
   * Use with {{#each}} to iterate:
   *   {{#each (zoteroPdfURIs entry.files)}}[PDF]({{this}}){{/each}}
   */
  hbs.registerHelper('zoteroPdfURIs', (files: unknown) => {
    const pdfs = findAllPdfs(files);
    return pdfs
      .map((pdf) => {
        const key = extractStorageKey(pdf);
        return key ? `zotero://open-pdf/library/items/${key}` : null;
      })
      .filter((uri): uri is string => uri !== null);
  });
}
