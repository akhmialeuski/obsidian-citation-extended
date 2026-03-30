import { DatabaseConfig } from '../../core';
import type { TemplateProfile } from '../../domain/template-profile';
import {
  DEFAULT_SETTINGS,
  CitationStylePreset,
  CITATION_STYLE_PRESETS,
} from './settings-schema';
import { DatabaseType } from '../../core';
import { ReferenceListSortOrder } from '../modals/sort-entries';

export class CitationsPluginSettings {
  public citationExportPath: string = DEFAULT_SETTINGS.citationExportPath;
  public citationExportFormat: DatabaseType =
    DEFAULT_SETTINGS.citationExportFormat;

  public literatureNoteTitleTemplate: string =
    DEFAULT_SETTINGS.literatureNoteTitleTemplate;
  public literatureNoteFolder: string = DEFAULT_SETTINGS.literatureNoteFolder;
  public literatureNoteContentTemplate: string =
    DEFAULT_SETTINGS.literatureNoteContentTemplate;
  public literatureNoteContentTemplatePath: string =
    DEFAULT_SETTINGS.literatureNoteContentTemplatePath;

  public citationStylePreset: CitationStylePreset =
    DEFAULT_SETTINGS.citationStylePreset;
  public markdownCitationTemplate: string =
    DEFAULT_SETTINGS.markdownCitationTemplate;
  public alternativeMarkdownCitationTemplate: string =
    DEFAULT_SETTINGS.alternativeMarkdownCitationTemplate;
  public autoCreateNoteOnCitation: boolean =
    DEFAULT_SETTINGS.autoCreateNoteOnCitation;
  public literatureNoteLinkDisplayTemplate: string =
    DEFAULT_SETTINGS.literatureNoteLinkDisplayTemplate;

  public referenceListSortOrder: ReferenceListSortOrder =
    DEFAULT_SETTINGS.referenceListSortOrder;

  public databases: DatabaseConfig[] = DEFAULT_SETTINGS.databases;
  public disableAutomaticNoteCreation: boolean =
    DEFAULT_SETTINGS.disableAutomaticNoteCreation;
  public templateProfiles: TemplateProfile[] =
    DEFAULT_SETTINGS.templateProfiles as TemplateProfile[];

  // Readwise integration
  public readwiseApiToken: string = DEFAULT_SETTINGS.readwiseApiToken;
  public readwiseLastSyncDate: string = DEFAULT_SETTINGS.readwiseLastSyncDate;

  /**
   * Returns the effective primary citation template, taking the active
   * preset into account.  When the preset is not 'custom', the preset
   * value overrides the user-defined field.
   */
  getEffectiveMarkdownCitationTemplate(): string {
    if (this.citationStylePreset !== 'custom') {
      return CITATION_STYLE_PRESETS[this.citationStylePreset].primary;
    }
    return this.markdownCitationTemplate;
  }

  /**
   * Returns the effective alternative citation template, taking the active
   * preset into account.
   */
  getEffectiveAlternativeMarkdownCitationTemplate(): string {
    if (this.citationStylePreset !== 'custom') {
      return CITATION_STYLE_PRESETS[this.citationStylePreset].alternative;
    }
    return this.alternativeMarkdownCitationTemplate;
  }
}
