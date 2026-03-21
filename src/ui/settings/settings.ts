import { DatabaseConfig } from '../../core';
import { DataSourceDefinition } from '../../data-source';
import { MergeStrategy } from '../../library/merge-strategy';
import { DEFAULT_SETTINGS } from './settings-schema';
import { DatabaseType } from '../../core';

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

  public markdownCitationTemplate: string =
    DEFAULT_SETTINGS.markdownCitationTemplate;
  public alternativeMarkdownCitationTemplate: string =
    DEFAULT_SETTINGS.alternativeMarkdownCitationTemplate;

  public databases: DatabaseConfig[] = DEFAULT_SETTINGS.databases;
  public dataSources?: DataSourceDefinition[];
  public mergeStrategy?: MergeStrategy;
  public disableAutomaticNoteCreation: boolean =
    DEFAULT_SETTINGS.disableAutomaticNoteCreation;
}
