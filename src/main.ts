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
import { ObsidianPlatformAdapter } from './platform/obsidian-adapter';
import { DataSourceRegistry } from './sources/data-source-registry';
import { DATA_SOURCE_TYPES } from './data-source';
import { LocalFileSource } from './sources/local-file-source';
import { VaultFileSource } from './sources/vault-file-source';

import { CitationSettingTab } from './ui/settings/settings-tab';
import { CitationsPluginSettings } from './ui/settings/settings';
import {
  DEFAULT_SETTINGS,
  DEFAULT_CONTENT_TEMPLATE,
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
  platform!: ObsidianPlatformAdapter;

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

      // Migrate inline content template to a vault file
      if (
        this.settings.literatureNoteContentTemplate &&
        !this.settings.literatureNoteContentTemplatePath
      ) {
        await this.migrateInlineTemplateToFile();
      }

      // Ensure new installs get a default template file
      if (!this.settings.literatureNoteContentTemplatePath) {
        await this.createDefaultTemplateFile();
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

  private static readonly DEFAULT_TEMPLATE_PATH =
    'citation-content-template.md';

  /**
   * Migrate an inline content template to a vault file.
   * Writes the template string to a file and updates the settings path.
   */
  private async migrateInlineTemplateToFile(): Promise<void> {
    const templateContent = this.settings.literatureNoteContentTemplate;
    if (!templateContent) return;

    const filePath = CitationPlugin.DEFAULT_TEMPLATE_PATH;
    const existingFile = this.app.vault.getAbstractFileByPath(
      normalizePath(filePath),
    );

    if (!existingFile) {
      try {
        await this.app.vault.create(filePath, templateContent);
        console.debug(
          `Citations plugin: Migrated inline template to ${filePath}`,
        );
      } catch (e) {
        console.warn('Citations plugin: Failed to migrate inline template:', e);
        return;
      }
    }

    this.settings.literatureNoteContentTemplatePath = filePath;
    this.settings.literatureNoteContentTemplate = '';
    await this.saveSettings();
  }

  /**
   * Create a default template file for new installations.
   */
  private async createDefaultTemplateFile(): Promise<void> {
    const filePath = CitationPlugin.DEFAULT_TEMPLATE_PATH;
    const existingFile = this.app.vault.getAbstractFileByPath(
      normalizePath(filePath),
    );

    if (!existingFile) {
      try {
        await this.app.vault.create(filePath, DEFAULT_CONTENT_TEMPLATE);
        console.debug(
          `Citations plugin: Created default template at ${filePath}`,
        );
      } catch (e) {
        console.warn('Citations plugin: Failed to create default template:', e);
        return;
      }
    }

    this.settings.literatureNoteContentTemplatePath = filePath;
    await this.saveSettings();
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    const workerManager = new WorkerManager(new LoadWorker());

    this.platform = new ObsidianPlatformAdapter(this.app, this);
    const platformAdapter = this.platform;

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

    this.templateService = new TemplateService(this.settings);
    this.noteService = new NoteService(
      platformAdapter,
      this.settings,
      this.templateService,
      () => this.resolveContentTemplate(),
    );
    this.libraryService = new LibraryService(
      this.settings,
      platformAdapter,
      workerManager,
    );
    this.libraryService.setDataSourceFactory(dataSourceFactory);

    this.uiService = new UIService(this);
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
   * Resolves the content template string by reading from the configured
   * vault file.  Falls back to the default template if the file is missing.
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
        `Citations: template file not found at "${templatePath}". Please check the path in settings.`,
      );
    }
    return DEFAULT_CONTENT_TEMPLATE;
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
