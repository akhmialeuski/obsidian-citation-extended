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
