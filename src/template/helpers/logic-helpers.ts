import Handlebars from 'handlebars';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

export function registerLogicHelpers(hbs: HandlebarsInstance): void {
  // Loose equality is intentional for flexible template comparisons
  hbs.registerHelper('eq', (a: unknown, b: unknown) => a == b);
  // Loose equality is intentional for flexible template comparisons
  hbs.registerHelper('ne', (a: unknown, b: unknown) => a != b);
  hbs.registerHelper(
    'gt',
    (a: unknown, b: unknown) => (a as number) > (b as number),
  );
  hbs.registerHelper(
    'lt',
    (a: unknown, b: unknown) => (a as number) < (b as number),
  );
  hbs.registerHelper(
    'gte',
    (a: unknown, b: unknown) => (a as number) >= (b as number),
  );
  hbs.registerHelper(
    'lte',
    (a: unknown, b: unknown) => (a as number) <= (b as number),
  );

  hbs.registerHelper('and', (...args: unknown[]) => {
    const actualArgs = args.slice(0, -1);
    return actualArgs.every(Boolean);
  });
  hbs.registerHelper('or', (...args: unknown[]) => {
    const actualArgs = args.slice(0, -1);
    return actualArgs.some(Boolean);
  });
  hbs.registerHelper('not', (value: unknown) => !value);
}
