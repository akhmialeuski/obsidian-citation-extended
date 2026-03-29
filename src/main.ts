import { FileSystemAdapter, Notice, Plugin } from 'obsidian';

import { TemplateService } from './template/template.service';
import { NoteService } from './notes/note.service';
import { LibraryService } from './library/library.service';
import { UIService } from './services/ui.service';

import { DataSourceFactory } from './sources/data-source-factory';
import { ObsidianPlatformAdapter } from './platform/obsidian-adapter';
import { DataSourceRegistry } from './sources/data-source-registry';
import { DATA_SOURCE_TYPES } from './data-source';
import { LocalFileSource } from './sources/local-file-source';
import { VaultFileSource } from './sources/vault-file-source';
import { SourceManager } from './infrastructure/source-manager';
import { TemplateProfileRegistry } from './domain/template-profile-registry';
import {
  NormalizationPipeline,
  SourceTaggingStep,
  DeduplicationStep,
} from './infrastructure/normalization-pipeline';
import {
  CitationService,
  ICitationService,
} from './application/citation.service';
import {
  ContentTemplateResolver,
  IContentTemplateResolver,
} from './application/content-template-resolver';

import { BatchNoteOrchestrator } from './notes/batch/batch-note-orchestrator';
import { CitationSettingTab } from './ui/settings/settings-tab';
import { CitationsPluginSettings } from './ui/settings/settings';
import {
  DEFAULT_SETTINGS,
  validateSettings,
} from './ui/settings/settings-schema';
import { WorkerManager } from './util';
import LoadWorker from 'web-worker:./worker';

export default class CitationPlugin extends Plugin {
  settings!: CitationsPluginSettings;
  templateService!: TemplateService;
  noteService!: NoteService;
  libraryService!: LibraryService;
  uiService!: UIService;

  platform!: ObsidianPlatformAdapter;
  citationService!: ICitationService;
  contentTemplateResolver!: IContentTemplateResolver;
  batchOrchestrator!: BatchNoteOrchestrator;

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

    // Infrastructure: source manager + normalization pipeline
    const sourceManager = new SourceManager(dataSourceFactory);
    const pipeline = new NormalizationPipeline()
      .addStep(new SourceTaggingStep())
      .addStep(new DeduplicationStep());

    // Template profile registry
    const profileRegistry = new TemplateProfileRegistry();
    for (const profile of this.settings.templateProfiles) {
      profileRegistry.register(profile);
    }

    // Application services
    this.contentTemplateResolver = new ContentTemplateResolver(
      platformAdapter.vault,
      platformAdapter.notifications,
      this.settings,
      (path: string) => platformAdapter.normalizePath(path),
      () => this.saveSettings(),
      profileRegistry,
    );

    this.templateService = new TemplateService(this.settings);
    this.noteService = new NoteService(
      platformAdapter,
      this.settings,
      this.templateService,
      () => this.contentTemplateResolver.resolve(),
    );
    this.libraryService = new LibraryService(
      this.settings,
      platformAdapter,
      workerManager,
      sourceManager,
      pipeline,
    );

    this.citationService = new CitationService(
      this.libraryService,
      this.templateService,
      this.contentTemplateResolver,
      this.settings,
    );

    this.batchOrchestrator = new BatchNoteOrchestrator(
      this.libraryService,
      this.noteService,
      this.templateService,
      platformAdapter.vault,
    );

    this.uiService = new UIService(this);

    // Run template migrations after services are ready
    if (
      this.settings.literatureNoteContentTemplate &&
      !this.settings.literatureNoteContentTemplatePath
    ) {
      await this.contentTemplateResolver.migrateInlineToFile();
    }
    if (!this.settings.literatureNoteContentTemplatePath) {
      await this.contentTemplateResolver.ensureDefaultTemplate();
    }

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
}
