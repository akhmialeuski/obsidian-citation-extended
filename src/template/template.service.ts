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

  public getTemplateVariables(
    entry: Entry,
    extras?: { selectedText?: string },
  ): TemplateContext {
    return entry.toTemplateContext(extras);
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

  public getMarkdownCitation(
    variables: TemplateContext,
    alternative = false,
  ): Result<string, TemplateRenderError> {
    const templateStr = alternative
      ? this.settings.getEffectiveAlternativeMarkdownCitationTemplate()
      : this.settings.getEffectiveMarkdownCitationTemplate();
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
