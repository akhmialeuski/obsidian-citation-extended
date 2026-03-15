import {
  Editor,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  Plugin,
} from 'obsidian';
import * as chokidar from 'chokidar';

import CitationEvents from './events';
import { TemplateService } from './template/template.service';
import { NoteService } from './notes/note.service';
import { LibraryService } from './services/library.service';
import { UIService } from './services/ui.service';
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

import { VaultExt, WorkspaceExt } from './obsidian-extensions.d';
import {
  CitationSettingTab,
  CitationsPluginSettings,
  DEFAULT_SETTINGS,
  validateSettings,
} from './settings';
import { DISALLOWED_FILENAME_CHARACTERS_RE, WorkerManager } from './util';
import LoadWorker from 'web-worker:./worker';

export default class CitationPlugin extends Plugin {
  settings!: CitationsPluginSettings;
  templateService!: TemplateService;
  noteService!: NoteService;
  libraryService!: LibraryService;
  uiService!: UIService;

  events = new CitationEvents();
  private fileWatcher?: chokidar.FSWatcher;

  private getActiveEditor(): Editor | null {
    // Standard MarkdownView approach
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) return view.editor;

    // Fallback: activeEditor supports Canvas text nodes, Lineage, etc.
    const ext = this.app.workspace as WorkspaceExt;
    return ext.activeEditor?.editor ?? null;
  }

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

  async openLiteratureNote(citekey: string, newPane: boolean): Promise<void> {
    const library = this.libraryService.library;
    if (!library) {
      new Notice(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) {
      new Notice(entryResult.error.message);
      return;
    }

    await this.noteService.openLiteratureNote(citekey, library, newPane);
  }

  async insertLiteratureNoteLink(citekey: string): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const library = this.libraryService.library;
    if (!library) {
      new Notice(new LibraryNotReadyError().message);
      return;
    }

    const entryResult = this.getEntry(citekey);
    if (!entryResult.ok) {
      new Notice(entryResult.error.message);
      return;
    }

    try {
      const file = await this.noteService.getOrCreateLiteratureNoteFile(
        citekey,
        library,
      );
      const titleResult = this.getTitleForCitekey(citekey);
      if (!titleResult.ok) {
        new Notice(titleResult.error.message);
        return;
      }

      const useMarkdown = (this.app.vault as VaultExt).getConfig(
        'useMarkdownLinks',
      );

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.app.metadataCache.fileToLinktext(file, '', false),
        );
        linkText = `[${titleResult.value}](${uri})`;
      } else {
        linkText = this.app.metadataCache.fileToLinktext(file, '', true);
        linkText = `[[${linkText}]]`;
      }

      editor.replaceSelection(linkText);
    } catch (error) {
      console.error('Failed to insert literature note link:', error);
      new Notice('Failed to insert literature note link');
    }
  }

  insertLiteratureNoteContent(citekey: string): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const contentResult = this.getInitialContentForCitekey(citekey);
    if (!contentResult.ok) {
      new Notice(contentResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(contentResult.value, cursor);
  }

  insertMarkdownCitation(citekey: string, alternative = false): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    const citationResult = alternative
      ? this.getAlternativeMarkdownCitationForCitekey(citekey)
      : this.getMarkdownCitationForCitekey(citekey);

    if (!citationResult.ok) {
      new Notice(citationResult.error.message);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceRange(citationResult.value, cursor);
  }
}
