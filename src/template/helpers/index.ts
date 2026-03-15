import Handlebars from 'handlebars';
import { registerLogicHelpers } from './logic-helpers';
import { registerStringHelpers } from './string-helpers';
import { registerPathHelpers } from './path-helpers';
import { registerAuthorHelpers } from './author-helpers';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

export function registerAllHelpers(hbs: HandlebarsInstance): void {
  registerLogicHelpers(hbs);
  registerStringHelpers(hbs);
  registerPathHelpers(hbs);
  registerAuthorHelpers(hbs);
}

export { registerLogicHelpers } from './logic-helpers';
export { registerStringHelpers } from './string-helpers';
export { registerPathHelpers } from './path-helpers';
export { registerAuthorHelpers } from './author-helpers';
