import { FileSystemAdapter, Notice, Plugin } from 'obsidian';
import * as chokidar from 'chokidar';

import CitationEvents from './events';
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

  events = new CitationEvents();
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

    const dataSourceFactory = new DataSourceFactory(
      vaultAdapter,
      workerManager,
      this.app.vault,
    );

    const mergeStrategy = this.settings.mergeStrategy || MergeStrategy.LastWins;

    this.templateService = new TemplateService(this.settings);
    this.noteService = new NoteService(
      this.app,
      this.settings,
      this.templateService,
    );
    this.libraryService = new LibraryService(
      this.settings,
      this.events,
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

  getInitialContentForCitekey(citekey: string): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
    );
    return this.templateService.getContent(variables);
  }

  getMarkdownCitationForCitekey(
    citekey: string,
  ): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
    );
    return this.templateService.getMarkdownCitation(variables);
  }

  getAlternativeMarkdownCitationForCitekey(
    citekey: string,
  ): Result<string, CitationError> {
    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) return entryResult;

    const variables = this.templateService.getTemplateVariables(
      entryResult.value,
    );
    return this.templateService.getMarkdownCitation(variables, true);
  }
}
