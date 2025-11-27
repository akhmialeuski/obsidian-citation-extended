import {
  Editor,
  FileSystemAdapter,
  MarkdownView,
  normalizePath,
  Notice,
  Plugin,
  TFile,
} from 'obsidian';
import * as path from 'path';

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

  literatureNoteErrorNotifier = new Notifier(
    'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
  );

  /**
   * Получает текущий активный редактор Markdown
   */
  private getActiveEditor(): Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.editor ?? null;
  }

  /**
   * Проверяет, есть ли активный редактор
   */
  private hasActiveEditor(): boolean {
    return this.getActiveEditor() !== null;
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

  onload(): void {
    this.loadSettings().then(() => {
      this.templateService = new TemplateService(this.settings);
      this.noteService = new NoteService(this.app, this.settings, this.templateService);
      this.libraryService = new LibraryService(
        this.settings,
        this.events,
        this.app.vault.adapter instanceof FileSystemAdapter ? this.app.vault.adapter : null
      );
      this.uiService = new UIService(this.app, this);
      this.init();
    });
  }

  async init(): Promise<void> {
    if (this.settings.citationExportPath) {
      // Load library for the first time
      this.libraryService.load();
      this.libraryService.initWatcher();
    } else {
      // TODO show warning?
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
    await this.noteService.openLiteratureNote(citekey, this.libraryService.library, newPane);
  }

  async insertLiteratureNoteLink(citekey: string): Promise<void> {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice('No active editor found');
      return;
    }

    try {
      const file = await this.noteService.getOrCreateLiteratureNoteFile(citekey, this.libraryService.library);
      const useMarkdown = (this.app.vault as VaultExt).getConfig('useMarkdownLinks');
      const title = this.getTitleForCitekey(citekey);

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.app.metadataCache.fileToLinktext(file, '', false)
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
