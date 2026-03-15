import Handlebars from 'handlebars';
import { Author } from '../../core';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

export function registerAuthorHelpers(hbs: HandlebarsInstance): void {
  hbs.registerHelper(
    'formatNames',
    (authors: unknown, options: Handlebars.HelperOptions) => {
      if (!Array.isArray(authors)) return '';
      const max = (options.hash.max as number) || 2;
      const etAl = (options.hash.etAl as string) || ' et al.';
      const connector = (options.hash.connector as string) || ' and ';

      const authorList = authors as Author[];
      const names = authorList.map(
        (a) => a.literal || a.family || a.given || '',
      );

      if (names.length === 0) return '';
      if (names.length === 1) return names[0];

      if (names.length <= max) {
        const last = names.pop();
        return names.join(', ') + connector + last;
      }

      return names[0] + etAl;
    },
  );
  hbs.registerHelper('join', (value: unknown, separator: string) => {
    if (!Array.isArray(value)) return value;
    return value.join(separator);
  });
  hbs.registerHelper('split', (value: unknown, separator: string) => {
    if (typeof value !== 'string') return value;
    return value.split(separator);
  });
}
