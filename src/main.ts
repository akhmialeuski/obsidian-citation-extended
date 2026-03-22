import {
  FileSystemAdapter,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from 'obsidian';
import * as chokidar from 'chokidar';

import { TemplateService } from './template/template.service';
import { NoteService } from './notes/note.service';
import { LibraryService } from './library/library.service';
import { UIService } from './services/ui.service';
import { EditorActions } from './ui/editor-actions';
import { MergeStrategy } from './library/merge-strategy';
import {
  Entry,
  Result,
  ok,
  err,
  CitationError,
  LibraryNotReadyError,
  EntryNotFoundError,
} from './core';
import { DataSourceFactory } from './sources/data-source-factory';
import { DataSourceRegistry } from './sources/data-source-registry';
import { DATA_SOURCE_TYPES } from './data-source';
import { LocalFileSource } from './sources/local-file-source';
import { VaultFileSource } from './sources/vault-file-source';

import { CitationSettingTab } from './ui/settings/settings-tab';
import { CitationsPluginSettings } from './ui/settings/settings';
import {
  DEFAULT_SETTINGS,
  validateSettings,
} from './ui/settings/settings-schema';
import { DISALLOWED_FILENAME_CHARACTERS_RE, WorkerManager } from './util';
import LoadWorker from 'web-worker:./worker';

export default class CitationPlugin extends Plugin {
  settings!: CitationsPluginSettings;
  templateService!: TemplateService;
  noteService!: NoteService;
  libraryService!: LibraryService;
  uiService!: UIService;
  editorActions!: EditorActions;

  private fileWatcher?: chokidar.FSWatcher;

  async loadSettings(): Promise<void> {
    this.settings = new CitationsPluginSettings();

    const loadedSettings = await this.loadData();
    if (!loadedSettings) return;

    const mergedSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
    const validationResult = validateSettings(mergedSettings);

    if (validationResult.success) {
      Object.assign(this.settings, validationResult.data);

      if (
        this.settings.databases.length === 0 &&
        this.settings.citationExportPath
      ) {
        console.debug(
          'Citations plugin: Migrating legacy settings to databases',
        );
        this.settings.databases.push({
          name: 'Default',
          path: this.settings.citationExportPath,
          type: this.settings.citationExportFormat,
        });
        void this.saveSettings();
      }
    } else {
      console.warn(
        'Citations plugin: Settings validation failed',
        validationResult.error,
      );
      new Notice('Invalid settings detected. Please check your configuration.');
      Object.assign(this.settings, mergedSettings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    const workerManager = new WorkerManager(new LoadWorker());

    const vaultAdapter =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter
        : null;

    // Register built-in data source types
    const registry = new DataSourceRegistry();
    registry.register(
      DATA_SOURCE_TYPES.LocalFile,
      (def, id) =>
        new LocalFileSource(
          id,
          def.path,
          def.format,
          workerManager,
          vaultAdapter,
        ),
    );
    registry.register(
      DATA_SOURCE_TYPES.VaultFile,
      (def, id) =>
        new VaultFileSource(
          id,
          def.path,
          def.format,
          workerManager,
          this.app.vault,
        ),
    );

    const dataSourceFactory = new DataSourceFactory(registry);

    const mergeStrategy = this.settings.mergeStrategy || MergeStrategy.LastWins;

    this.templateService = new TemplateService(this.settings);
    this.noteService = new NoteService(
      this.app,
      this.settings,
      this.templateService,
      () => this.resolveContentTemplate(),
    );
    this.libraryService = new LibraryService(
      this.settings,
      vaultAdapter,
      workerManager,
      [],
      mergeStrategy,
    );
    this.libraryService.setDataSourceFactory(dataSourceFactory);

    this.uiService = new UIService(this.app, this);
    this.editorActions = new EditorActions(this);

    this.init();
  }

  onunload(): void {
    this.uiService.dispose();
    this.libraryService.dispose();
  }

  init(): void {
    if (this.settings.databases.length > 0) {
      void this.libraryService.load();
    } else {
      console.warn('Citations plugin: No data sources configured');
    }

    this.uiService.init();
    this.addSettingTab(new CitationSettingTab(this.app, this));
  }

  /**
   * Retrieves a library entry by citekey, with readiness and existence checks.
   */
  getEntry(citekey: string): Result<Entry, CitationError> {
    const library = this.libraryService.library;
    if (this.libraryService.isLibraryLoading || !library) {
      return err(new LibraryNotReadyError());
    }

    const entry = library.entries[citekey];
    if (!entry) {
      return err(new EntryNotFoundError(citekey));
    }

    return ok(entry);
  }

  getTitleForCitekey(citekey: string): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
    );
    const titleResult = this.templateService.getTitle(variables);
    if (!titleResult.ok) return titleResult;

    return ok(
      titleResult.value.replace(DISALLOWED_FILENAME_CHARACTERS_RE, '_'),
    );
  }

  /**
   * Resolves the content template string, reading from a vault file if
   * `literatureNoteContentTemplatePath` is configured, otherwise falling
   * back to the inline setting.
   */
  async resolveContentTemplate(): Promise<string> {
    const templatePath = this.settings.literatureNoteContentTemplatePath;
    if (templatePath) {
      const file = this.app.vault.getAbstractFileByPath(
        normalizePath(templatePath),
      );
      if (file instanceof TFile) {
        return this.app.vault.read(file);
      }
      new Notice(
        `Citations: template file not found at "${templatePath}", using inline template`,
      );
    }
    return this.settings.literatureNoteContentTemplate;
  }

  async getInitialContentForCitekey(
    citekey: string,
    selectedText?: string,
  ): Promise<Result<string, CitationError>> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
      { selectedText },
    );
    const templateStr = await this.resolveContentTemplate();
    return this.templateService.render(templateStr, variables);
  }

  getMarkdownCitationForCitekey(
    citekey: string,
    selectedText?: string,
  ): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
      { selectedText },
    );
    return this.templateService.getMarkdownCitation(variables);
  }

  getAlternativeMarkdownCitationForCitekey(
    citekey: string,
    selectedText?: string,
  ): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
      { selectedText },
    );
    return this.templateService.getMarkdownCitation(variables, true);
  }
}
