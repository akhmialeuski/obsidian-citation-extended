import Handlebars from 'handlebars';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

export function registerStringHelpers(hbs: HandlebarsInstance): void {
  hbs.registerHelper(
    'replace',
    (value: string, pattern: string, replacement: string) => {
      if (typeof value !== 'string') return value;
      return value.replace(new RegExp(pattern, 'g'), replacement);
    },
  );
  hbs.registerHelper('truncate', (value: string, length: number) => {
    if (typeof value !== 'string') return value;
    if (value.length <= length) return value;
    return value.substring(0, length);
  });

  hbs.registerHelper('match', (value: string, pattern: string) => {
    if (typeof value !== 'string') return '';
    const match = value.match(new RegExp(pattern));
    return match ? match[0] : '';
  });

  hbs.registerHelper('quote', (value: unknown) => {
    return JSON.stringify(value);
  });
}
