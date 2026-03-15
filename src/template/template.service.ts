import Handlebars from 'handlebars';
import { CitationsPluginSettings } from '../ui/settings/settings';
import {
  Entry,
  TemplateContext,
  Result,
  ok,
  err,
  TemplateRenderError,
} from '../core';
import { ITemplateService } from '../container';
import { registerAllHelpers } from './helpers';

export class TemplateService implements ITemplateService {
  private hbs = Handlebars.create();
  private cache = new Map<string, Handlebars.TemplateDelegate>();
  private templateSettings = {
    noEscape: true,
  };

  constructor(private settings: CitationsPluginSettings) {
    registerAllHelpers(this.hbs);
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

  private compile(templateStr: string): Handlebars.TemplateDelegate {
    let compiled = this.cache.get(templateStr);
    if (!compiled) {
      compiled = this.hbs.compile(templateStr, this.templateSettings);
      this.cache.set(templateStr, compiled);
    }
    return compiled;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public render(
    templateStr: string,
    variables: TemplateContext,
  ): Result<string, TemplateRenderError> {
    try {
      const template = this.compile(templateStr);
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

  public validate(templateStr: string): Result<void, TemplateRenderError> {
    try {
      this.hbs.precompile(templateStr, this.templateSettings);
      return ok(undefined);
    } catch (e) {
      return err(
        new TemplateRenderError(`Invalid template: ${(e as Error).message}`),
      );
    }
  }
}
