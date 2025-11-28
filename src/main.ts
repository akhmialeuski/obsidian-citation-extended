import {
  Editor,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  Plugin,
} from 'obsidian';

import CitationEvents from './events';
import { TemplateService } from './services/template.service';
import { NoteService } from './services/note.service';
import { LibraryService } from './services/library.service';
import { UIService } from './services/ui.service';
import { LocalFileSource, VaultFileSource } from './sources';
import { DataSource, DataSourceDefinition, MergeStrategy } from './data-source';
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

  literatureNoteErrorNotifier = new Notifier(
    'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
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
    } else {
      console.warn(
        'Citations Plugin: Settings validation failed',
        validationResult.error,
      );
      new Notice(
        'Citations Plugin: Invalid settings detected. Please check your configuration.',
      );
      // Fallback to best-effort loading
      Object.assign(this.settings, mergedSettings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onload(): void {
    this.loadSettings().then(() => {
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
      const mergeStrategy =
        this.settings.mergeStrategy || MergeStrategy.LastWins;

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
    });
  }

  /**
   * Create data sources based on settings
   * Supports both new multi-source configuration and legacy single-file configuration
   */
  private createDataSources(workerManager: WorkerManager): DataSource[] {
    const sources: DataSource[] = [];
    const vaultAdapter =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter
        : null;

    // Check if new multi-source config exists
    if (this.settings.dataSources && this.settings.dataSources.length > 0) {
      // Use new multi-source configuration
      this.settings.dataSources.forEach(
        (def: DataSourceDefinition, index: number) => {
          const source = this.createDataSource(
            def,
            `source-${index}`,
            vaultAdapter,
            workerManager,
          );
          if (source) {
            sources.push(source);
          }
        },
      );
    } else if (this.settings.citationExportPath) {
      // Backward compatibility: use citationExportPath
      // Detect mobile by checking if FileSystemAdapter is available
      const sourceType = vaultAdapter ? 'local-file' : 'vault-file';
      const source = this.createDataSource(
        {
          type: sourceType,
          path: this.settings.citationExportPath,
          format: this.settings.citationExportFormat,
        },
        'default',
        vaultAdapter,
        workerManager,
      );

      if (source) {
        sources.push(source);
      }
    }

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

  async init(): Promise<void> {
    if (this.libraryService.getSources().length > 0) {
      // Load library for the first time
      this.libraryService.load();
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
        linkText = `[[${title}]]`;
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
  async insertLiteratureNoteContent(citekey: string): Promise<void> {
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

  async insertMarkdownCitation(
    citekey: string,
    alternative = false,
  ): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    try {
      const func = alternative
        ? this.getAlternativeMarkdownCitationForCitekey
        : this.getMarkdownCitationForCitekey;
      const citation = func.bind(this)(citekey);

      const cursor = editor.getCursor();
      editor.replaceRange(citation, cursor);
    } catch (error) {
      console.error('Failed to insert markdown citation:', error);
      new Notice('Failed to insert markdown citation');
    }
  }
}
