import {
  Editor,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  Plugin,
} from 'obsidian';
import * as chokidar from 'chokidar';

import CitationEvents from './events';
import { TemplateService } from './services/template.service';
import { NoteService } from './services/note.service';
import { LibraryService } from './services/library.service';
import { UIService } from './services/ui.service';
import { LocalFileSource, VaultFileSource } from './sources';
import { DataSource, MergeStrategy } from './data-source';
import { DatabaseType } from './types';

import { VaultExt } from './obsidian-extensions.d';
import {
  CitationSettingTab,
  CitationsPluginSettings,
  DEFAULT_SETTINGS,
  validateSettings,
} from './settings';
import {
  DISALLOWED_FILENAME_CHARACTERS_RE,
  Notifier,
  WorkerManager,
} from './util';
import LoadWorker from 'web-worker:./worker';

export default class CitationPlugin extends Plugin {
  settings!: CitationsPluginSettings;
  templateService!: TemplateService;
  noteService!: NoteService;
  libraryService!: LibraryService;
  uiService!: UIService;

  events = new CitationEvents();
  private fileWatcher?: chokidar.FSWatcher;

  literatureNoteErrorNotifier = new Notifier(
    'Unable to access literature note. Please check that the literature note folder exists, and that the note name is valid.',
  );

  /**
   * Gets the current active Markdown editor
   */
  private getActiveEditor(): Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.editor ?? null;
  }

  /**
   * Checks if there is an active editor
   */
  private hasActiveEditor(): boolean {
    return this.getActiveEditor() !== null;
  }

  async loadSettings(): Promise<void> {
    this.settings = new CitationsPluginSettings();

    const loadedSettings = await this.loadData();
    if (!loadedSettings) return;

    const mergedSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
    const validationResult = validateSettings(mergedSettings);

    if (validationResult.success) {
      Object.assign(this.settings, validationResult.data);

      // Migration: If databases is empty but legacy path exists, migrate it
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
      // Fallback to best-effort loading
      Object.assign(this.settings, mergedSettings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.templateService = new TemplateService(this.settings);
    this.noteService = new NoteService(
      this.app,
      this.settings,
      this.templateService,
    );

    // Create worker manager
    const workerManager = new WorkerManager(new LoadWorker());

    // Create data sources
    const sources = this.createDataSources(workerManager);
    const mergeStrategy = this.settings.mergeStrategy || MergeStrategy.LastWins;

    this.libraryService = new LibraryService(
      this.settings,
      this.events,
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter
        : null,
      workerManager,
      sources,
      mergeStrategy,
    );
    this.uiService = new UIService(this.app, this);
    this.init();
  }

  onunload(): void {
    this.libraryService.dispose();
    // @ts-expect-error -- literatureNoteErrorNotifier is not nullable in type definition but needs to be cleared
    this.literatureNoteErrorNotifier = null;
  }

  /**
   * Create data sources based on settings
   */
  private createDataSources(workerManager: WorkerManager): DataSource[] {
    const sources: DataSource[] = [];
    const vaultAdapter =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter
        : null;

    // Use databases configuration
    this.settings.databases.forEach(
      (
        def: { name: string; path: string; type: DatabaseType },
        index: number,
      ) => {
        const source = this.createDataSource(
          { type: 'local-file', path: def.path, format: def.type },
          `source-${index}`,
          vaultAdapter,
          workerManager,
        );
        if (source) {
          sources.push(source);
        }
      },
    );

    return sources;
  }

  /**
   * Create a single data source from a definition
   */
  private createDataSource(
    def: { type: string; path: string; format: DatabaseType },
    id: string,
    vaultAdapter: FileSystemAdapter | null,
    workerManager: WorkerManager,
  ): DataSource | null {
    try {
      if (def.type === 'local-file') {
        return new LocalFileSource(
          id,
          def.path,
          def.format,
          workerManager,
          vaultAdapter,
        );
      } else if (def.type === 'vault-file') {
        return new VaultFileSource(
          id,
          def.path,
          def.format,
          workerManager,
          this.app.vault,
        );
      } else {
        console.error(`Unknown data source type: ${def.type}`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to create data source ${id}:`, error);
      return null;
    }
  }

  init(): void {
    if (this.libraryService.getSources().length > 0) {
      // Load library for the first time
      void this.libraryService.load();
      this.libraryService.initWatcher();
    } else {
      console.warn('Citations plugin: No data sources configured');
    }

    this.uiService.init();

    this.addSettingTab(new CitationSettingTab(this.app, this));
  }

  getTitleForCitekey(citekey: string): string {
    const entry = this.libraryService.library.entries[citekey];
    const variables = this.templateService.getTemplateVariables(entry);
    const unsafeTitle = this.templateService.getTitle(variables);
    return unsafeTitle.replace(DISALLOWED_FILENAME_CHARACTERS_RE, '_');
  }

  getInitialContentForCitekey(citekey: string): string {
    const entry = this.libraryService.library.entries[citekey];
    const variables = this.templateService.getTemplateVariables(entry);
    return this.templateService.getContent(variables);
  }

  getMarkdownCitationForCitekey(citekey: string): string {
    const entry = this.libraryService.library.entries[citekey];
    const variables = this.templateService.getTemplateVariables(entry);
    return this.templateService.getMarkdownCitation(variables);
  }

  getAlternativeMarkdownCitationForCitekey(citekey: string): string {
    const entry = this.libraryService.library.entries[citekey];
    const variables = this.templateService.getTemplateVariables(entry);
    return this.templateService.getMarkdownCitation(variables, true);
  }

  /**
   * Run a case-insensitive search for the literature note file corresponding to
   * the given citekey. If no corresponding file is found, create one.
   */

  async openLiteratureNote(citekey: string, newPane: boolean): Promise<void> {
    await this.noteService.openLiteratureNote(
      citekey,
      this.libraryService.library,
      newPane,
    );
  }

  async insertLiteratureNoteLink(citekey: string): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    try {
      const file = await this.noteService.getOrCreateLiteratureNoteFile(
        citekey,
        this.libraryService.library,
      );
      const useMarkdown = (this.app.vault as VaultExt).getConfig(
        'useMarkdownLinks',
      );
      const title = this.getTitleForCitekey(citekey);

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.app.metadataCache.fileToLinktext(file, '', false),
        );
        linkText = `[${title}](${uri})`;
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

  /**
   * Format literature note content for a given reference and insert in the
   * currently active pane.
   */
  insertLiteratureNoteContent(citekey: string): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    try {
      const content = this.getInitialContentForCitekey(citekey);
      const cursor = editor.getCursor();
      editor.replaceRange(content, cursor);
    } catch (error) {
      console.error('Failed to insert literature note content:', error);
      new Notice('Failed to insert literature note content');
    }
  }

  insertMarkdownCitation(citekey: string, alternative = false): void {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    try {
      const citation = alternative
        ? this.getAlternativeMarkdownCitationForCitekey(citekey)
        : this.getMarkdownCitationForCitekey(citekey);

      const cursor = editor.getCursor();
      editor.replaceRange(citation, cursor);
    } catch (error) {
      console.error('Failed to insert Markdown citation:', error);
      new Notice('Failed to insert Markdown citation');
    }
  }
}
