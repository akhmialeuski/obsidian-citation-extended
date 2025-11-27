import {
  FileSystemAdapter,
  MarkdownSourceView,
  MarkdownView,
  normalizePath,
  Plugin,
  TFile,
  debounce,
} from 'obsidian';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as CodeMirror from 'codemirror';

import {
  compile as compileTemplate,
  TemplateDelegate as Template,
} from 'handlebars';


import CitationEvents from './events';
import { TemplateService } from './services/template.service';
import { NoteService } from './services/note.service';
import { LibraryService } from './services/library.service';
import { UIService } from './services/ui.service';

import { VaultExt } from './obsidian-extensions.d';
import { CitationSettingTab, CitationsPluginSettings } from './settings';
import {
  Entry,
  EntryData,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  IIndexable,
  Library,
} from './types';
import {
  DISALLOWED_FILENAME_CHARACTERS_RE,
  Notifier,
  WorkerManager,
  WorkerManagerBlocked,
} from './util';
import LoadWorker from 'web-worker:./worker';

export default class CitationPlugin extends Plugin {
  settings: CitationsPluginSettings;
  templateService: TemplateService;
  noteService: NoteService;
  libraryService: LibraryService;
  uiService: UIService;

  events = new CitationEvents();
  private fileWatcher?: chokidar.FSWatcher;

  literatureNoteErrorNotifier: Notifier;

  get editor(): CodeMirror.Editor {
    const view = this.app.workspace.activeLeaf.view;
    if (!(view instanceof MarkdownView)) return null;

    const sourceView = view.sourceMode;
    return (sourceView as MarkdownSourceView).cmEditor;
  }

  async loadSettings(): Promise<void> {
    this.settings = new CitationsPluginSettings();

    const loadedSettings = await this.loadData();
    if (!loadedSettings) return;

    const toLoad = [
      'citationExportPath',
      'citationExportFormat',
      'literatureNoteTitleTemplate',
      'literatureNoteFolder',
      'literatureNoteContentTemplate',
      'markdownCitationTemplate',
      'alternativeMarkdownCitationTemplate',
    ];
    toLoad.forEach((setting) => {
      if (setting in loadedSettings) {
        (this.settings as IIndexable)[setting] = loadedSettings[setting];
      }
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.literatureNoteErrorNotifier = new Notifier(
      'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
    );

    this.templateService = new TemplateService(this.settings);
    this.noteService = new NoteService(this.app, this.settings, this.templateService);
    this.libraryService = new LibraryService(
      this.settings,
      this.events,
      this.app.vault.adapter instanceof FileSystemAdapter ? this.app.vault.adapter : null
    );
    this.uiService = new UIService(this.app, this);

    await this.initializeLibrary();

    this.uiService.registerCommands();
    this.addSettingTab(new CitationSettingTab(this.app, this));
  }

  onunload(): void {
    this.cleanup();
  }

  private async initializeLibrary(): Promise<void> {
    if (this.settings.citationExportPath) {
      this.libraryService.load();
      this.setupFileWatcher();
    } else {
      // TODO show warning?
    }
  }

  private setupFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    const watchOptions = {
      awaitWriteFinish: {
        stabilityThreshold: 500,
      },
      ignoreInitial: true,
    };

    const libraryPath = this.libraryService.resolveLibraryPath(
      this.settings.citationExportPath
    );

    try {
      this.fileWatcher = chokidar.watch(libraryPath, watchOptions);

      const debouncedLoad = debounce(
        () => {
          console.debug('Citation library file changed, reloading...');
          this.libraryService.load();
        },
        1000,
        true
      );

      this.fileWatcher.on('change', () => {
        debouncedLoad();
      });

      this.fileWatcher.on('error', (error) => {
        console.error('Citation plugin: watcher error:', error);
        this.libraryService.loadErrorNotifier.show(
          'Error watching citation library file. Please check plugin settings.'
        );
      });
    } catch (error) {
      console.error('Citation plugin: failed to create watcher:', error);
      this.libraryService.loadErrorNotifier.show();
    }
  }

  private cleanup(): void {
    console.debug('Citation plugin: cleaning up resources');

    // Close file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Destroy notifiers
    if (this.literatureNoteErrorNotifier) {
      this.literatureNoteErrorNotifier.destroy();
      this.literatureNoteErrorNotifier = null;
    }

    // Destroy services (which handle their own cleanup)
    if (this.libraryService) {
      this.libraryService.destroy();
    }

    // Clear events
    // this.events = null; // Optional, as it's garbage collected
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
    await this.noteService.openLiteratureNote(citekey, this.libraryService.library, newPane);
  }

  async insertLiteratureNoteLink(citekey: string): Promise<void> {
    this.noteService.getOrCreateLiteratureNoteFile(citekey, this.libraryService.library)
      .then((file: TFile) => {
        const useMarkdown: boolean = (<VaultExt>this.app.vault).getConfig(
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

        this.editor.replaceSelection(linkText);
      })
      .catch(console.error);
  }

  /**
   * Format literature note content for a given reference and insert in the
   * currently active pane.
   */
  async insertLiteratureNoteContent(citekey: string): Promise<void> {
    const content = this.getInitialContentForCitekey(citekey);
    this.editor.replaceRange(content, this.editor.getCursor());
  }

  async insertMarkdownCitation(
    citekey: string,
    alternative = false,
  ): Promise<void> {
    const func = alternative
      ? this.getAlternativeMarkdownCitationForCitekey
      : this.getMarkdownCitationForCitekey;
    const citation = func.bind(this)(citekey);

    this.editor.replaceRange(citation, this.editor.getCursor());
  }
}
