import Handlebars from 'handlebars';
import { CitationsPluginSettings } from '../settings';
import { Author, Entry, TemplateContext } from '../types';
import { Result, ok, err } from '../result';
import { TemplateRenderError } from '../errors';
import { ITemplateService } from '../container';

export class TemplateService implements ITemplateService {
  private templateSettings = {
    noEscape: true,
  };

  constructor(private settings: CitationsPluginSettings) {
    this.registerHelpers();
  }

  private registerHelpers() {
    // Loose equality is intentional for flexible template comparisons
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a == b);
    // Loose equality is intentional for flexible template comparisons
    Handlebars.registerHelper('ne', (a: unknown, b: unknown) => a != b);
    Handlebars.registerHelper(
      'gt',
      (a: unknown, b: unknown) => (a as number) > (b as number),
    );
    Handlebars.registerHelper(
      'lt',
      (a: unknown, b: unknown) => (a as number) < (b as number),
    );
    Handlebars.registerHelper(
      'gte',
      (a: unknown, b: unknown) => (a as number) >= (b as number),
    );
    Handlebars.registerHelper(
      'lte',
      (a: unknown, b: unknown) => (a as number) <= (b as number),
    );

    Handlebars.registerHelper('and', (...args: unknown[]) => {
      const actualArgs = args.slice(0, -1);
      return actualArgs.every(Boolean);
    });
    Handlebars.registerHelper('or', (...args: unknown[]) => {
      const actualArgs = args.slice(0, -1);
      return actualArgs.some(Boolean);
    });
    Handlebars.registerHelper('not', (value: unknown) => !value);

    Handlebars.registerHelper(
      'replace',
      (value: string, pattern: string, replacement: string) => {
        if (typeof value !== 'string') return value;
        return value.replace(new RegExp(pattern, 'g'), replacement);
      },
    );
    Handlebars.registerHelper('truncate', (value: string, length: number) => {
      if (typeof value !== 'string') return value;
      if (value.length <= length) return value;
      return value.substring(0, length);
    });

    Handlebars.registerHelper('match', (value: string, pattern: string) => {
      if (typeof value !== 'string') return '';
      const match = value.match(new RegExp(pattern));
      return match ? match[0] : '';
    });

    Handlebars.registerHelper('quote', (value: unknown) => {
      return JSON.stringify(value);
    });
    Handlebars.registerHelper('urlEncode', (value: unknown) => {
      if (typeof value !== 'string') return value;
      return encodeURI(value);
    });
    Handlebars.registerHelper('basename', (value: string) => {
      if (typeof value !== 'string') return value;
      return value.replace(/^.*[\\/]/, '');
    });
    Handlebars.registerHelper('filename', (value: string) => {
      if (typeof value !== 'string') return value;
      return value.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
    });
    Handlebars.registerHelper('dirname', (value: string) => {
      if (typeof value !== 'string') return value;
      return value.replace(/[\\/][^\\/]*$/, '');
    });
    Handlebars.registerHelper('join', (value: unknown, separator: string) => {
      if (!Array.isArray(value)) return value;
      return value.join(separator);
    });
    Handlebars.registerHelper('split', (value: unknown, separator: string) => {
      if (typeof value !== 'string') return value;
      return value.split(separator);
    });
    Handlebars.registerHelper(
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
  }

  public getTemplateVariables(entry: Entry): TemplateContext {
    const shortcuts = {
      citekey: entry.id,

      abstract: entry.abstract,
      authorString: entry.authorString,
      containerTitle: entry.containerTitle,
      DOI: entry.DOI,
      eprint: entry.eprint,
      eprinttype: entry.eprinttype,
      eventPlace: entry.eventPlace,
      keywords: entry.keywords,
      language: entry.language,
      note: entry.note,
      page: entry.page,
      publisher: entry.publisher,
      publisherPlace: entry.publisherPlace,
      series: entry.series,
      volume: entry.volume,
      source: entry.source,
      title: entry.title,
      titleShort: entry.titleShort,
      type: entry.type,
      URL: entry.URL,
      year: entry.year?.toString(),
      zoteroSelectURI: entry.zoteroSelectURI,
      zoteroId: entry.zoteroId,
      date: entry.issuedDate
        ? entry.issuedDate.toISOString().split('T')[0]
        : null,
    };

    return { entry: entry.toJSON(), ...shortcuts };
  }

  public render(
    templateStr: string,
    variables: TemplateContext,
  ): Result<string, TemplateRenderError> {
    try {
      const template = Handlebars.compile(templateStr, this.templateSettings);
      return ok(template(variables));
    } catch (e) {
      return err(
        new TemplateRenderError(
          `Template render failed: ${(e as Error).message}`,
        ),
      );
    }
  }

  public getTitle(
    variables: TemplateContext,
  ): Result<string, TemplateRenderError> {
    return this.render(this.settings.literatureNoteTitleTemplate, variables);
  }

  public getContent(
    variables: TemplateContext,
  ): Result<string, TemplateRenderError> {
    return this.render(this.settings.literatureNoteContentTemplate, variables);
  }

  public getMarkdownCitation(
    variables: TemplateContext,
    alternative = false,
  ): Result<string, TemplateRenderError> {
    const templateStr = alternative
      ? this.settings.alternativeMarkdownCitationTemplate
      : this.settings.markdownCitationTemplate;
    return this.render(templateStr, variables);
  }
}
