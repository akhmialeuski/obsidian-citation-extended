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
}
