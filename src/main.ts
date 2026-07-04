import { FileSystemAdapter, Notice, Plugin } from 'obsidian';
import {
  obsidianHttpGet,
  obsidianZoteroGet,
  obsidianZoteroPost,
} from './platform/obsidian-http';

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
import { ReadwiseSource } from './sources/readwise-source';
import { ZoteroSource } from './sources/zotero-source';
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
  resolveSyncIntervalMs,
} from './ui/settings/settings-schema';
import { WorkerManager } from './util';
import {
  generateDatabaseId,
  ReadwiseApiClient,
  resolveReadwiseFilters,
  resolveZoteroExportNotes,
  resolveZoteroImportAnnotations,
  ZoteroConnectorClient,
} from './core';
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

    const loadedSettings: unknown = await this.loadData();
    if (!loadedSettings || typeof loadedSettings !== 'object') return;

    const mergedSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
    const validationResult = validateSettings(mergedSettings);

    if (validationResult.success) {
      Object.assign(this.settings, validationResult.data);

      let needsSave = false;

      // Migrate legacy single-database setting to databases array
      if (
        this.settings.databases.length === 0 &&
        this.settings.citationExportPath
      ) {
        console.debug(
          'Citations plugin: Migrating legacy settings to databases',
        );
        this.settings.databases.push({
          id: generateDatabaseId(),
          name: 'Default',
          path: this.settings.citationExportPath,
          type: this.settings.citationExportFormat,
        });
        needsSave = true;
      }

      // Migrate databases that lack a stable id (pre-v2.1 installs)
      for (const db of this.settings.databases) {
        if (!db.id) {
          db.id = generateDatabaseId();
          needsSave = true;
        }
      }

      if (needsSave) {
        console.debug('Citations plugin: Settings migrated, saving');
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

    // Worker factory (not an instance): the manager pools several workers
    // for parallel parsing and recreates them after abort-termination.
    const workerManager = new WorkerManager(() => new LoadWorker());

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

    // Register Readwise source type — token lives in db.path (passed via def.path).
    // Each Readwise database gets its own cache file keyed by the stable source
    // id, so multiple Readwise databases never collide on a single shared cache.
    const readwiseCacheDir = this.manifest?.dir ?? '';
    const cacheNameSanitizeRe = /[^a-zA-Z0-9_-]/g;
    registry.register(
      DATA_SOURCE_TYPES.Readwise,
      (def, id) =>
        new ReadwiseSource(
          id,
          new ReadwiseApiClient(def.path, obsidianHttpGet),
          workerManager,
          platformAdapter.fileSystem,
          readwiseCacheDir
            ? `${readwiseCacheDir}/readwise-cache-${id.replace(cacheNameSanitizeRe, '-')}.json`
            : '',
          // Interval PROVIDER (not a snapshot): the source re-reads it on
          // every poll cycle, so settings changes apply without recreating
          // the source. Clamp at point of use: a persisted out-of-range value
          // (older build or hand-edited data.json) bypasses the schema max
          // and would otherwise overflow the timer.
          () =>
            resolveSyncIntervalMs(this.settings.readwiseSyncIntervalMinutes) ??
            0,
          // Resolve per-database filters from settings via the generic
          // databaseId, keeping source-specific config off DataSourceDefinition.
          resolveReadwiseFilters(this.settings.databases, def.databaseId),
        ),
    );

    // Register Zotero (Better BibTeX) source type — def.path holds the pull
    // export URL; def.format selects the parser (CSL JSON or BibLaTeX). Each
    // gets its own offline cache keyed by the stable source id.
    registry.register(
      DATA_SOURCE_TYPES.Zotero,
      (def, id) =>
        new ZoteroSource(
          id,
          new ZoteroConnectorClient(
            def.path,
            obsidianZoteroGet,
            obsidianZoteroPost,
          ),
          workerManager,
          def.format,
          resolveZoteroExportNotes(this.settings.databases, def.databaseId),
          platformAdapter.fileSystem,
          readwiseCacheDir
            ? `${readwiseCacheDir}/zotero-cache-${id.replace(cacheNameSanitizeRe, '-')}.json`
            : '',
          // Interval provider (not a snapshot): re-read every poll cycle so a
          // settings change applies without recreating the source.
          () =>
            resolveSyncIntervalMs(this.settings.zoteroSyncIntervalMinutes) ?? 0,
          resolveZoteroImportAnnotations(
            this.settings.databases,
            def.databaseId,
          ),
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
