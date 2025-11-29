import { compile as compileTemplate } from 'handlebars';
import { CitationsPluginSettings } from '../settings';
import { Entry, TemplateContext } from '../types';

export class TemplateService {
  private templateSettings = {
    noEscape: true,
  };

  constructor(private settings: CitationsPluginSettings) {}

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
      language: entry.language,
      note: entry.note,
      page: entry.page,
      publisher: entry.publisher,
      publisherPlace: entry.publisherPlace,
      source: entry.source,
      title: entry.title,
      titleShort: entry.titleShort,
      type: entry.type,
      URL: entry.URL,
      year: entry.year?.toString(),
      zoteroSelectURI: entry.zoteroSelectURI,
    };

    return { entry: entry.toJSON(), ...shortcuts };
  }

  public render(templateStr: string, variables: TemplateContext): string {
    const template = compileTemplate(templateStr, this.templateSettings);
    return template(variables);
  }

  public getTitle(variables: TemplateContext): string {
    return this.render(this.settings.literatureNoteTitleTemplate, variables);
  }

  public getContent(variables: TemplateContext): string {
    return this.render(this.settings.literatureNoteContentTemplate, variables);
  }

  public getMarkdownCitation(
    variables: TemplateContext,
    alternative = false,
  ): string {
    const templateStr = alternative
      ? this.settings.alternativeMarkdownCitationTemplate
      : this.settings.markdownCitationTemplate;
    return this.render(templateStr, variables);
  }
}
