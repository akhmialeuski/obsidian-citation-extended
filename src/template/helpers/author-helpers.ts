import Handlebars from 'handlebars';
import { Author } from '../../core';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

export function registerAuthorHelpers(hbs: HandlebarsInstance): void {
  hbs.registerHelper(
    'formatNames',
    (authors: unknown, options: Handlebars.HelperOptions) => {
      if (!Array.isArray(authors)) return '';
      const hash = options.hash as {
        max?: number;
        etAl?: string;
        connector?: string;
      };
      const max = hash.max || 2;
      const etAl = hash.etAl || ' et al.';
      const connector = hash.connector || ' and ';

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
