import Handlebars from 'handlebars';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

/**
 * Supported format tokens:
 *   YYYY — 4-digit year
 *   MM   — 2-digit month (01–12)
 *   DD   — 2-digit day   (01–31)
 *   HH   — 2-digit hour  (00–23)
 *   mm   — 2-digit minute (00–59)
 *   ss   — 2-digit second (00–59)
 */
export function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  };

  // Replace longest tokens first to avoid partial matches (e.g. MM before M)
  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(token).join(value);
  }
  return result;
}

const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

export function registerDateHelpers(hbs: HandlebarsInstance): void {
  hbs.registerHelper('currentDate', (options: Handlebars.HelperOptions) => {
    const format = (options.hash.format as string) || DEFAULT_DATE_FORMAT;
    return formatDate(new Date(), format);
  });
}
