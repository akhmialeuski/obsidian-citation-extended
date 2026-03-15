import Handlebars from 'handlebars';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

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
}
