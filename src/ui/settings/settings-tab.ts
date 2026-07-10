import {
  App,
  debounce,
  FileSystemAdapter,
  PluginSettingTab,
  Setting,
  Notice,
} from 'obsidian';

import CitationPlugin from '../../main';
import {
  DatabaseConfig,
  ReadwiseFilters,
  DATABASE_TYPE_LABELS,
  DATABASE_FORMATS,
  generateDatabaseId,
  ReadwiseApiClient,
  ZoteroConnectorClient,
  ZoteroLocalApiClient,
  ZOTERO_LOCAL_API_DEFAULT_BASE,
  NOTE_UPDATE_MODE_LABELS,
  UPDATE_CONFIRMATION_LABELS,
} from '../../core';
import type { NoteUpdateMode, UpdateConfirmationMode } from '../../core';
import {
  obsidianHttpGet,
  obsidianSchedule,
  obsidianZoteroGet,
  obsidianZoteroPost,
} from '../../platform/obsidian-http';
import {
  DATA_SOURCE_TYPES,
  isZoteroBbtConfig,
  ZOTERO_EXPORT_FORMATS,
} from '../../data-source';
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  CitationsPluginSettingsType,
  CitationStylePreset,
  CITATION_STYLE_PRESETS,
  READWISE_SYNC_INTERVAL_MIN_MINUTES,
  READWISE_SYNC_INTERVAL_MAX_MINUTES,
  READWISE_FILTER_MIN_HIGHLIGHTS,
  LIBRARY_LOAD_TIMEOUT_MIN_SECONDS,
  LIBRARY_LOAD_TIMEOUT_MAX_SECONDS,
  LIBRARY_LOAD_TIMEOUT_DEFAULT_SECONDS,
} from './settings-schema';
import { ReferenceListSortOrder } from '../../library/sort-entries';
import { VariableListModal } from '../modals/variable-list-modal';
import {
  classifySyncOutcome,
  SyncOutcomeKind,
} from '../../library/sync-outcome';
import { LoadingStatus } from '../../library/library-state';

/** Maximum number of sync warnings appended to the "synced with warnings" notice. */
const MAX_SURFACED_SYNC_WARNINGS = 3;

/**
 * Virtual dropdown value for the live Zotero (Better BibTeX) source. It is a
 * SOURCE choice, not a storage type: it persists as `type: csl-json|biblatex`
 * plus `sourceType: 'zotero'`, so no settings migration is needed.
 */
const SOURCE_OPTION_ZOTERO_BBT = 'zotero-bbt';

/**
 * The "Database source" dropdown: every way to get references is a
 * first-class entry here — file formats, Readwise, and BOTH Zotero
 * connections. No source hides behind a toggle on another source's card.
 */
const DATABASE_SOURCE_OPTIONS: Record<string, string> = {
  [DATABASE_FORMATS.CslJson]: 'Better CSL JSON (file)',
  [DATABASE_FORMATS.BibLaTeX]: 'Better BibTeX (file)',
  [DATABASE_FORMATS.Hayagriva]: 'Hayagriva (YAML file)',
  [DATABASE_FORMATS.Readwise]: 'Readwise',
  [SOURCE_OPTION_ZOTERO_BBT]: 'Zotero (Better BibTeX)',
  [DATABASE_FORMATS.ZoteroApi]: 'Zotero (local API)',
};

const SORT_ORDER_LABELS: Record<ReferenceListSortOrder, string> = {
  default: 'Default (file order)',
  'year-desc': 'By year (newest first)',
  'year-asc': 'By year (oldest first)',
  'author-asc': 'By author (A to Z)',
};

const CITATION_STYLE_PRESET_LABELS: Record<CitationStylePreset, string> = {
  custom: 'Custom',
  textcite: 'Textcite — Author (Year)',
  parencite: 'Parencite — (Author, Year)',
  citekey: 'Citekey — [@citekey]',
};

const DOCS_BASE =
  'https://github.com/akhmialeuski/obsidian-citation-extended/blob/master/docs';

export class CitationSettingTab extends PluginSettingTab {
  private plugin: CitationPlugin;
  private debouncedReload = debounce(() => {
    void this.plugin.libraryService.load();
  }, 2000);

  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.setAttr('id', 'zoteroSettingTab');

    this.renderDatabaseSection(containerEl);
    this.renderLiteratureNotesSection(containerEl);
    this.renderCitationsSection(containerEl);
    this.renderDisplaySection(containerEl);
  }

  private renderDatabaseSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Citation databases').setHeading();
    containerEl.createEl('p', {
      text: 'Configure one or more citation databases. The plugin will load references from all configured sources.',
      cls: 'setting-item-description',
    });

    const databasesContainer = containerEl.createDiv(
      'citation-databases-container',
    );

    this.plugin.settings.databases.forEach((db, index) => {
      this.renderDatabaseCard(databasesContainer, db, index);
    });

    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText('Add database')
        .setCta()
        .onClick(() => {
          void (async () => {
            if (this.plugin.settings.databases.length >= 20) {
              new Notice('Maximum number of databases (20) reached.');
              return;
            }
            this.plugin.settings.databases.push({
              id: generateDatabaseId(),
              name: `Database ${this.plugin.settings.databases.length + 1}`,
              type: DATABASE_FORMATS.CslJson,
              path: '',
            });
            await this.plugin.saveSettings();
            this.display();
          })();
        });
    });

    new Setting(containerEl)
      .setName('Library load timeout (seconds)')
      .setDesc(
        'Maximum time to wait for all databases to load and parse before ' +
          'aborting. Raise this if you see "Timeout loading citation database" ' +
          `with a large library. Default ${LIBRARY_LOAD_TIMEOUT_DEFAULT_SECONDS}, ` +
          `range ${LIBRARY_LOAD_TIMEOUT_MIN_SECONDS}–${LIBRARY_LOAD_TIMEOUT_MAX_SECONDS}.`,
      )
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.libraryLoadTimeoutSeconds))
          .onChange(
            // Debounced to mirror the Readwise sync-interval field and avoid
            // rewriting the input mid-typing (the clamp writes the value back).
            debounce(async (value: string) => {
              const num = parseInt(value, 10);
              if (isNaN(num)) return;
              // Clamp to the schema range so an out-of-range entry is corrected
              // (and reflected back) instead of being silently dropped.
              const clamped = Math.min(
                Math.max(num, LIBRARY_LOAD_TIMEOUT_MIN_SECONDS),
                LIBRARY_LOAD_TIMEOUT_MAX_SECONDS,
              );
              this.plugin.settings.libraryLoadTimeoutSeconds = clamped;
              await this.plugin.saveSettings();
              if (clamped !== num) {
                text.setValue(String(clamped));
                new Notice(
                  `Library load timeout clamped to ${LIBRARY_LOAD_TIMEOUT_MIN_SECONDS}–${LIBRARY_LOAD_TIMEOUT_MAX_SECONDS} seconds.`,
                );
              }
            }, 500),
          );
        text.inputEl.type = 'number';
        text.inputEl.min = String(LIBRARY_LOAD_TIMEOUT_MIN_SECONDS);
        text.inputEl.max = String(LIBRARY_LOAD_TIMEOUT_MAX_SECONDS);
        text.inputEl.setCssProps({ width: '80px' });
      });
  }

  private renderDatabaseCard(
    container: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    const card = container.createDiv('citation-database-setting');
    card.setCssProps({
      border: '1px solid var(--background-modifier-border)',
      padding: '10px',
      marginBottom: '10px',
      borderRadius: '4px',
    });

    const header = card.createDiv('citation-database-header');
    header.setCssProps({
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '10px',
    });

    new Setting(header)
      .setName(`Database ${index + 1}`)
      .addText((text) => {
        text
          .setPlaceholder('Friendly name')
          .setValue(db.name)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].name = value;
            await this.plugin.saveSettings();
          });
      })
      .addExtraButton((button) => {
        button
          .setIcon('trash')
          .setTooltip('Remove database')
          .onClick(() => {
            void (async () => {
              const removed = this.plugin.settings.databases[index];
              this.plugin.settings.databases.splice(index, 1);
              // Clean up Readwise-specific state when removing a Readwise database
              if (removed.type === DATABASE_FORMATS.Readwise) {
                this.plugin.settings.readwiseLastSyncDate = '';
              }
              await this.plugin.saveSettings();
              this.display();
              void this.plugin.libraryService.load();
            })();
          });
      });

    new Setting(card).setName('Database source').addDropdown((dropdown) => {
      dropdown.addOptions(DATABASE_SOURCE_OPTIONS);
      dropdown.setValue(CitationSettingTab.sourceOptionFor(db));
      dropdown.onChange(async (value) => {
        const db = this.plugin.settings.databases[index];
        CitationSettingTab.switchDatabaseSource(db, value);
        await this.plugin.saveSettings();
        this.display();
        // Live Better BibTeX and Readwise need a URL/token before a load can
        // succeed, so re-render their fields and wait for input rather than
        // firing a load that would just error.
        const needsConnectionInput =
          value === SOURCE_OPTION_ZOTERO_BBT ||
          value === DATABASE_FORMATS.Readwise;
        if (!needsConnectionInput) {
          new Notice('Database source changed. Reloading library…');
          void this.plugin.libraryService.load();
        }
      });
    });

    if (db.type === DATABASE_FORMATS.Readwise) {
      this.renderReadwiseFields(card, db, index);
    } else if (db.type === DATABASE_FORMATS.ZoteroApi) {
      this.renderZoteroApiFields(card, db, index);
    } else if (CitationSettingTab.isLiveZotero(db)) {
      this.renderZoteroExportFormatField(card, db, index);
      this.renderZoteroFields(card, db, index);
    } else {
      this.renderFilePathField(card, db, index);
    }
  }

  /** True when the database is a live Zotero (Better BibTeX) pull. */
  private static isLiveZotero(db: DatabaseConfig): boolean {
    // Shared with SourceManager.resolveTransport — the rendered fields always
    // match how the source is actually routed.
    return isZoteroBbtConfig(db);
  }

  /** Which source-dropdown option represents the database's current config. */
  private static sourceOptionFor(db: DatabaseConfig): string {
    return CitationSettingTab.isLiveZotero(db)
      ? SOURCE_OPTION_ZOTERO_BBT
      : db.type;
  }

  /**
   * Switch a database to a new source-dropdown option, preserving connection
   * strings. `path` means something different for each source (file path, BBT
   * URL, Readwise token, API base URL), so the outgoing value is stashed under
   * its kind and the incoming kind's stashed value restored — switching source
   * and back is lossless, and a mis-click never destroys a configured path.
   */
  private static switchDatabaseSource(
    db: DatabaseConfig,
    option: string,
  ): void {
    const outgoing = CitationSettingTab.sourceOptionFor(db);
    const stash = { ...(db.sourcePaths ?? {}) };
    stash[outgoing] = db.path;
    db.sourcePaths = stash;
    db.path = stash[option] ?? '';

    if (option === SOURCE_OPTION_ZOTERO_BBT) {
      // Live Better BibTeX pull: keep the current export format when BBT can
      // serve it, otherwise default to CSL JSON.
      if (!ZOTERO_EXPORT_FORMATS.has(db.type)) {
        db.type = DATABASE_FORMATS.CslJson;
      }
      db.sourceType = DATA_SOURCE_TYPES.Zotero;
      return;
    }

    db.type = option;
    if (option === DATABASE_FORMATS.Readwise) {
      db.sourceType = DATA_SOURCE_TYPES.Readwise;
    } else {
      // File formats and the native Zotero API imply their transport.
      delete db.sourceType;
    }
  }

  /**
   * Export-format sub-setting for a live Zotero (Better BibTeX) source: the
   * SOURCE is chosen in the main dropdown; this only selects which format the
   * pull-export URL serves (and therefore which parser runs).
   */
  private renderZoteroExportFormatField(
    card: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    new Setting(card)
      .setName('Export format')
      .setDesc(
        'Format of the Better BibTeX pull export — must match the URL below ' +
          '(.json ↔ CSL JSON, .biblatex ↔ BibLaTeX).',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions({
          [DATABASE_FORMATS.CslJson]:
            DATABASE_TYPE_LABELS[DATABASE_FORMATS.CslJson],
          [DATABASE_FORMATS.BibLaTeX]:
            DATABASE_TYPE_LABELS[DATABASE_FORMATS.BibLaTeX],
        });
        dropdown.setValue(db.type);
        dropdown.onChange(async (value) => {
          this.plugin.settings.databases[index].type = value;
          await this.plugin.saveSettings();
          new Notice('Export format changed. Reloading library…');
          void this.plugin.libraryService.load();
        });
      });
  }

  /**
   * Fields for a live Zotero (Better BibTeX) source: the pull-export URL, an
   * "import notes/annotations" toggle, a polling interval, and a test/sync
   * pair. The URL is stored in `db.path` (the generic connection string).
   */
  private renderZoteroFields(
    card: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    new Setting(card)
      .setName('Better BibTeX export URL')
      .setDesc(
        'In Zotero, right-click a library or collection → "Download Better ' +
          'BibTeX export…" and paste the URL here. Pick the CSL JSON or ' +
          'BibLaTeX variant to match the database format above.',
      )
      .addText((text) => {
        text
          .setPlaceholder(
            'http://127.0.0.1:23119/better-bibtex/collection?/0/ABCD1234.json',
          )
          .setValue(db.path)
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.databases[index].path = value.trim();
              await this.plugin.saveSettings();
            }, 500),
          );
      });

    new Setting(card)
      .setName('Import notes')
      .setDesc(
        'Include Zotero child notes in the export (exportNotes=true). ' +
          'They become available via the {{note}} template variable.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(db.zoteroExportNotes ?? false)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].zoteroExportNotes = value;
            await this.plugin.saveSettings();
            // Recreating the source (key includes this flag) happens on reload.
            void this.plugin.libraryService.load();
          });
      });

    new Setting(card)
      .setName('Import PDF annotations')
      .setDesc(
        'Fetch native Zotero PDF annotations (highlights, comments, colors, ' +
          'page deep-links) for every entry. Available in templates via ' +
          '{{annotations}} and {{attachments}}. Requires Better BibTeX.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(db.zoteroImportAnnotations ?? false)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].zoteroImportAnnotations =
              value;
            await this.plugin.saveSettings();
            // Recreating the source (key includes this flag) happens on reload.
            void this.plugin.libraryService.load();
          });
      });

    new Setting(card)
      .setName('Auto-sync interval (minutes)')
      .setDesc(
        'How often to re-fetch from Zotero. Set to 0 to disable (refresh manually).',
      )
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.zoteroSyncIntervalMinutes))
          .onChange(
            debounce(async (value: string) => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= READWISE_SYNC_INTERVAL_MIN_MINUTES) {
                // Clamp to the schema max so the saved value never overflows
                // window.setInterval.
                const clamped = Math.min(
                  num,
                  READWISE_SYNC_INTERVAL_MAX_MINUTES,
                );
                this.plugin.settings.zoteroSyncIntervalMinutes = clamped;
                await this.plugin.saveSettings();
                // Reflect a clamped value back into the field so the UI never
                // disagrees with the saved value, and tell the user.
                if (clamped !== num) {
                  text.setValue(String(clamped));
                  new Notice(
                    `Sync interval capped at ${READWISE_SYNC_INTERVAL_MAX_MINUTES} minutes (1 week).`,
                  );
                }
              }
            }, 500),
          );
        text.inputEl.type = 'number';
        text.inputEl.min = String(READWISE_SYNC_INTERVAL_MIN_MINUTES);
        text.inputEl.max = String(READWISE_SYNC_INTERVAL_MAX_MINUTES);
        text.inputEl.setCssProps({ width: '80px' });
      });

    const statusEl = card.createDiv('zotero-status');
    statusEl.setCssProps({ fontSize: '0.8em', marginTop: '5px' });

    new Setting(card)
      .addButton((button) => {
        button.setButtonText('Test connection').onClick(() => {
          void (async () => {
            const url = this.plugin.settings.databases[index].path;
            if (!url) {
              new Notice('Please enter the Better BibTeX export URL first.');
              return;
            }
            statusEl.setText('Connecting…');
            statusEl.setCssProps({ color: 'var(--text-muted)' });
            try {
              const client = new ZoteroConnectorClient(
                url,
                obsidianZoteroGet,
                obsidianZoteroPost,
              );
              const versions = await client.ping();
              statusEl.setText(
                `Connected — Zotero ${versions.zotero}, Better BibTeX ${versions.betterbibtex}.`,
              );
              statusEl.setCssProps({ color: 'var(--text-success)' });
            } catch (e) {
              statusEl.setText(
                e instanceof Error ? e.message : 'Connection failed.',
              );
              statusEl.setCssProps({ color: 'var(--text-error)' });
            }
          })();
        });
      })
      .addButton((button) => {
        button
          .setButtonText('Sync now')
          .setCta()
          .onClick(() => {
            void (async () => {
              const url = this.plugin.settings.databases[index].path;
              if (!url) {
                new Notice('Please enter the Better BibTeX export URL first.');
                return;
              }
              new Notice('Fetching from Zotero…');
              await this.plugin.libraryService.load();
            })();
          });
      });
  }

  /**
   * Fields for a native Zotero local API source (Zotero 7+, no Better
   * BibTeX): base URL, optional group/collection scope, the shared sync
   * interval, and a test/sync button pair. The base URL is stored in
   * `db.path` — empty means the default `http://127.0.0.1:23119`.
   */
  private renderZoteroApiFields(
    card: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    const hint = card.createEl('p', { cls: 'setting-item-description' });
    hint.setText(
      'Reads your library straight from a running Zotero (7 or later) — no ' +
        'Better BibTeX or file export required. In Zotero, enable Settings → ' +
        'Advanced → "Allow other applications on this computer to ' +
        'communicate with Zotero".',
    );

    new Setting(card)
      .setName('Zotero API base URL')
      .setDesc(
        'Leave empty for the default local server (http://127.0.0.1:23119).',
      )
      .addText((text) => {
        text
          .setPlaceholder(ZOTERO_LOCAL_API_DEFAULT_BASE)
          .setValue(db.path)
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.databases[index].path = value.trim();
              await this.plugin.saveSettings();
            }, 500),
          );
      });

    new Setting(card)
      .setName('Group library ID')
      .setDesc(
        'Numeric Zotero group id to load a group library. Leave empty for ' +
          'your personal library.',
      )
      .addText((text) => {
        text
          .setPlaceholder('123456')
          .setValue(db.zoteroApiGroupId ?? '')
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.databases[index].zoteroApiGroupId =
                value.trim();
              await this.plugin.saveSettings();
            }, 500),
          );
      });

    new Setting(card)
      .setName('Collection key')
      .setDesc(
        'Restrict the import to one collection (the 8-character key from ' +
          'the collection URL). Leave empty for the whole library.',
      )
      .addText((text) => {
        text
          .setPlaceholder('ABCD1234')
          .setValue(db.zoteroApiCollection ?? '')
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.databases[index].zoteroApiCollection =
                value.trim();
              await this.plugin.saveSettings();
            }, 500),
          );
      });

    new Setting(card)
      .setName('Import PDF annotations')
      .setDesc(
        'Fetch native Zotero PDF annotations (highlights, comments, colors, ' +
          'page deep-links) for every entry. Available in templates via ' +
          '{{annotations}} and {{attachments}}.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(db.zoteroImportAnnotations ?? false)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].zoteroImportAnnotations =
              value;
            await this.plugin.saveSettings();
            // Recreating the source (key includes this flag) happens on reload.
            void this.plugin.libraryService.load();
          });
      });

    new Setting(card)
      .setName('Auto-sync interval (minutes)')
      .setDesc(
        'How often to re-fetch from Zotero. Set to 0 to disable (refresh manually). Shared with the Better BibTeX live connection.',
      )
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.zoteroSyncIntervalMinutes))
          .onChange(
            debounce(async (value: string) => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= READWISE_SYNC_INTERVAL_MIN_MINUTES) {
                this.plugin.settings.zoteroSyncIntervalMinutes = Math.min(
                  num,
                  READWISE_SYNC_INTERVAL_MAX_MINUTES,
                );
                await this.plugin.saveSettings();
              }
            }, 500),
          );
        text.inputEl.type = 'number';
        text.inputEl.min = String(READWISE_SYNC_INTERVAL_MIN_MINUTES);
        text.inputEl.max = String(READWISE_SYNC_INTERVAL_MAX_MINUTES);
        text.inputEl.setCssProps({ width: '80px' });
      });

    const statusEl = card.createDiv('zotero-api-status');
    statusEl.setCssProps({ fontSize: '0.8em', marginTop: '5px' });

    new Setting(card)
      .addButton((button) => {
        button.setButtonText('Test connection').onClick(() => {
          void (async () => {
            statusEl.setText('Connecting…');
            statusEl.setCssProps({ color: 'var(--text-muted)' });
            try {
              const dbNow = this.plugin.settings.databases[index];
              const client = new ZoteroLocalApiClient(
                dbNow.path,
                obsidianZoteroGet,
              );
              const result = await client.ping({
                groupId: dbNow.zoteroApiGroupId?.trim() || undefined,
                collectionKey: dbNow.zoteroApiCollection?.trim() || undefined,
              });
              statusEl.setText(
                `Connected — ${result.totalItems} item${
                  result.totalItems === 1 ? '' : 's'
                } visible${result.apiVersion ? ` (API v${result.apiVersion})` : ''}.`,
              );
              statusEl.setCssProps({ color: 'var(--text-success)' });
            } catch (e) {
              statusEl.setText(
                e instanceof Error ? e.message : 'Connection failed.',
              );
              statusEl.setCssProps({ color: 'var(--text-error)' });
            }
          })();
        });
      })
      .addButton((button) => {
        button
          .setButtonText('Sync now')
          .setCta()
          .onClick(() => {
            void (async () => {
              new Notice('Fetching from Zotero…');
              await this.plugin.libraryService.load();
            })();
          });
      });
  }

  private async checkDatabasePath(
    filePath: string,
    statusEl: HTMLElement,
  ): Promise<boolean> {
    statusEl.empty();
    statusEl.setText('Checking path...');
    statusEl.setCssProps({ color: 'var(--text-muted)' });

    try {
      await FileSystemAdapter.readLocalFile(
        this.plugin.libraryService.resolveLibraryPath(filePath),
      );
      statusEl.setText('Path verified.');
      statusEl.setCssProps({ color: 'var(--text-success)' });
      return true;
    } catch {
      statusEl.setText('File not found.');
      statusEl.setCssProps({ color: 'var(--text-error)' });
      return false;
    }
  }

  private renderFilePathField(
    card: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    new Setting(card)
      .setName('Database path')
      .setDesc('Absolute path or path relative to vault root.')
      .addText((text) => {
        text
          .setPlaceholder('/path/to/export.json')
          .setValue(db.path)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].path = value;
            await this.plugin.saveSettings();
            const valid = await this.checkDatabasePath(value, pathStatusEl);
            if (valid) {
              this.debouncedReload();
            }
          });
      });

    const pathStatusEl = card.createDiv('citation-path-status');
    pathStatusEl.setCssProps({ fontSize: '0.8em', marginTop: '5px' });

    if (db.path) {
      void this.checkDatabasePath(db.path, pathStatusEl);
    }
  }

  private renderReadwiseFields(
    card: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    // API token stored in db.path — the "connection string" for this database
    new Setting(card)
      .setName('API token')
      .setDesc(
        'Your Readwise access token. Get it from Readwise.io/access_token.',
      )
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
        text
          .setPlaceholder('Enter your Readwise API token')
          .setValue(db.path)
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.databases[index].path = value;
              await this.plugin.saveSettings();
            }, 500),
          );
      });

    // Sync interval
    new Setting(card)
      .setName('Auto-sync interval (minutes)')
      .setDesc(
        'How often to fetch new data from Readwise. Set to 0 to disable.',
      )
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.readwiseSyncIntervalMinutes))
          .onChange(
            debounce(async (value: string) => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= READWISE_SYNC_INTERVAL_MIN_MINUTES) {
                // Clamp to the schema max so the saved value never overflows
                // window.setInterval.
                const clamped = Math.min(
                  num,
                  READWISE_SYNC_INTERVAL_MAX_MINUTES,
                );
                this.plugin.settings.readwiseSyncIntervalMinutes = clamped;
                await this.plugin.saveSettings();
                // Reflect a clamped value back into the field so the UI never
                // disagrees with the saved value, and tell the user.
                if (clamped !== num) {
                  text.setValue(String(clamped));
                  new Notice(
                    `Sync interval capped at ${READWISE_SYNC_INTERVAL_MAX_MINUTES} minutes (1 week).`,
                  );
                }
              }
            }, 500),
          );
        text.inputEl.type = 'number';
        text.inputEl.min = String(READWISE_SYNC_INTERVAL_MIN_MINUTES);
        text.inputEl.max = String(READWISE_SYNC_INTERVAL_MAX_MINUTES);
        text.inputEl.setCssProps({ width: '80px' });
      });

    // Advanced filters (per-database import filters)
    this.renderReadwiseFilters(card, db, index);

    // Status display
    const statusEl = card.createDiv('readwise-status');
    statusEl.setCssProps({ fontSize: '0.8em', marginTop: '5px' });

    if (this.plugin.settings.readwiseLastSyncDate) {
      statusEl.setText(
        `Last sync: ${this.plugin.settings.readwiseLastSyncDate}`,
      );
      statusEl.setCssProps({ color: 'var(--text-muted)' });
    }

    // Validate + Sync buttons
    new Setting(card)
      .addButton((button) => {
        button.setButtonText('Validate token').onClick(() => {
          void (async () => {
            const token = this.plugin.settings.databases[index].path;
            if (!token) {
              new Notice('Please enter an API token first.');
              return;
            }
            statusEl.setText('Validating...');
            statusEl.setCssProps({ color: 'var(--text-muted)' });
            try {
              const client = new ReadwiseApiClient(
                token,
                obsidianHttpGet,
                obsidianSchedule,
              );
              const valid = await client.validateToken();
              if (valid) {
                statusEl.setText('Token is valid. Loading library…');
                statusEl.setCssProps({ color: 'var(--text-success)' });
                new Notice('Readwise token validated. Loading library…');
                void this.plugin.libraryService.load();
              } else {
                statusEl.setText('Token is invalid.');
                statusEl.setCssProps({ color: 'var(--text-error)' });
                new Notice(
                  'Readwise token is invalid. Please check and retry.',
                );
              }
            } catch {
              statusEl.setText('Validation failed — network error.');
              statusEl.setCssProps({ color: 'var(--text-error)' });
              new Notice(
                'Could not reach Readwise API. Check your connection.',
              );
            }
          })();
        });
      })
      .addButton((button) => {
        button
          .setButtonText('Sync now')
          .setCta()
          .onClick(() => {
            void (async () => {
              const token = this.plugin.settings.databases[index].path;
              if (!token) {
                new Notice('Please enter an API token first.');
                return;
              }
              new Notice('Syncing Readwise data...');
              const result = await this.plugin.libraryService.load();

              // A newer reload (poll timer or debounced file change) can
              // supersede this sync: load() returns null when its signal is
              // aborted. The superseding load may still be Loading OR may have
              // already finished (Success). Only a genuine failure sets the
              // Error state, so treat any null result that is NOT in the Error
              // state as a benign supersession rather than a failure.
              if (
                result === null &&
                this.plugin.libraryService.state.status !== LoadingStatus.Error
              ) {
                statusEl.setText('Sync superseded by a newer reload…');
                statusEl.setCssProps({ color: 'var(--text-muted)' });
                return;
              }

              const outcome = classifySyncOutcome(
                this.plugin.libraryService.state,
                result,
              );

              // On failure, report the error and DO NOT persist a misleading
              // last-sync date or claim success.
              if (outcome.kind === SyncOutcomeKind.Failure) {
                statusEl.setText(outcome.message);
                statusEl.setCssProps({ color: 'var(--text-error)' });
                new Notice(outcome.message);
                return;
              }

              this.plugin.settings.readwiseLastSyncDate =
                new Date().toISOString();
              await this.plugin.saveSettings();

              const isWarning =
                outcome.kind === SyncOutcomeKind.SuccessWithWarnings;
              statusEl.setText(
                isWarning
                  ? `Last sync: ${this.plugin.settings.readwiseLastSyncDate} — ${outcome.warnings.length} warning(s)`
                  : `Last sync: ${this.plugin.settings.readwiseLastSyncDate}`,
              );
              statusEl.setCssProps({
                color: isWarning ? 'var(--text-warning)' : 'var(--text-muted)',
              });
              new Notice(
                isWarning
                  ? `${outcome.message} ${outcome.warnings
                      .slice(0, MAX_SURFACED_SYNC_WARNINGS)
                      .join('; ')}`
                  : outcome.message,
              );
            })();
          });
      });
  }

  /**
   * Render the "Advanced filters" sub-section for a Readwise database.
   * Filters are stored per-database in `db.readwiseFilters`; an empty filter
   * set is pruned so the config round-trips to `undefined`.
   */
  private renderReadwiseFilters(
    card: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    // Use the standard settings sub-heading (consistent styling) rather than a
    // raw <details> element, which Obsidian does not theme. The filter rows are
    // appended to the same database card, directly under the heading.
    new Setting(card).setName('Advanced filters').setHeading();

    const parseList = (value: string): string[] =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    const listToString = (list?: string[]): string => (list ?? []).join(', ');

    const getFilters = (): ReadwiseFilters => {
      const cfg = this.plugin.settings.databases[index];
      if (!cfg.readwiseFilters) cfg.readwiseFilters = {};
      return cfg.readwiseFilters;
    };

    const persist = async (): Promise<void> => {
      // Prune an all-empty filter object so it round-trips to undefined.
      const cfg = this.plugin.settings.databases[index];
      const f = cfg.readwiseFilters;
      if (
        f &&
        (f.categories?.length ?? 0) === 0 &&
        (f.tags?.length ?? 0) === 0 &&
        (f.readerLocations?.length ?? 0) === 0 &&
        f.minHighlights === undefined
      ) {
        delete cfg.readwiseFilters;
      }
      await this.plugin.saveSettings();
      this.debouncedReload();
    };

    const listFilters: Array<{
      key: 'categories' | 'tags' | 'readerLocations';
      name: string;
      desc: string;
    }> = [
      {
        key: 'categories',
        name: 'Categories',
        desc: 'Comma-separated. Import only these categories (e.g. books, articles).',
      },
      {
        key: 'tags',
        name: 'Tags',
        desc: 'Comma-separated. Import only entries that have at least one of these tags.',
      },
      {
        key: 'readerLocations',
        name: 'Reader locations',
        desc: 'Comma-separated. Import only Reader documents in these locations (e.g. later, archive).',
      },
    ];

    for (const { key, name, desc } of listFilters) {
      new Setting(card)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          text.setValue(listToString(db.readwiseFilters?.[key])).onChange(
            debounce(async (value: string) => {
              const list = parseList(value);
              if (list.length > 0) {
                getFilters()[key] = list;
              } else {
                const f = this.plugin.settings.databases[index].readwiseFilters;
                if (f) delete f[key];
              }
              await persist();
            }, 500),
          );
        });
    }

    new Setting(card)
      .setName('Minimum highlights')
      .setDesc(
        'Import only books with at least this many highlights (highlight-mode entries).',
      )
      .addText((text) => {
        text
          .setValue(db.readwiseFilters?.minHighlights?.toString() ?? '')
          .onChange(
            debounce(async (value: string) => {
              const trimmed = value.trim();
              if (trimmed === '') {
                const f = this.plugin.settings.databases[index].readwiseFilters;
                if (f) delete f.minHighlights;
              } else {
                const num = parseInt(trimmed, 10);
                if (!isNaN(num) && num >= READWISE_FILTER_MIN_HIGHLIGHTS) {
                  getFilters().minHighlights = num;
                }
              }
              await persist();
            }, 500),
          );
        text.inputEl.type = 'number';
        text.inputEl.min = String(READWISE_FILTER_MIN_HIGHLIGHTS);
        text.inputEl.setCssProps({ width: '80px' });
      });
  }

  private renderLiteratureNotesSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Literature notes').setHeading();

    this.buildTextField(
      containerEl,
      'Literature note folder',
      'Save literature note files in this folder within your vault. If empty, notes will be stored in the root directory of the vault.',
      'literatureNoteFolder',
    );

    new Setting(containerEl)
      .setName('Disable automatic note creation')
      .setDesc(
        'When enabled, the "Open literature note" command will only open existing notes. ' +
          'No new notes will be created automatically. Useful when using another plugin (e.g. Zotero Integration) for note creation.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.disableAutomaticNoteCreation)
          .onChange(async (value) => {
            this.plugin.settings.disableAutomaticNoteCreation = value;
            await this.plugin.saveSettings();
          });
      });

    this.buildTextField(
      containerEl,
      'Note identifier field',
      'Frontmatter field name used to match notes to library entries when the filename no longer matches. ' +
        'Leave empty to disable. Your content template must include the field (e.g. citekey: {{citekey}}).',
      'noteIdentifierField',
    );

    this.buildTextField(
      containerEl,
      'Filename sanitization replacement',
      'Character(s) used to replace illegal filename characters (e.g. : * ? " < > |). ' +
        'Default is underscore (_). Use a space for "Title Subtitle", a dash for "Title- Subtitle", ' +
        'or leave empty to remove characters entirely.',
      'filenameSanitizationReplacement',
    );

    new Setting(containerEl)
      .setName('Note update mode')
      .setDesc(
        'How "Update literature note(s)" treats existing notes. Smart sync ' +
          'manages only the callout blocks and frontmatter keys produced by ' +
          'your template (merging your edits and library changes three-way) ' +
          'and never touches anything else; frontmatter-only leaves the body ' +
          'alone entirely; overwrite replaces the whole note.',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions(NOTE_UPDATE_MODE_LABELS);
        dropdown.setValue(this.plugin.settings.noteUpdateMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.noteUpdateMode = value as NoteUpdateMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Review changes before writing')
      .setDesc(
        'When to show the diff dialog during note updates. Conflicts happen ' +
          'when both you and the library changed the same block or ' +
          'frontmatter key since the last sync.',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions(UPDATE_CONFIRMATION_LABELS);
        dropdown.setValue(this.plugin.settings.updateConfirmation);
        dropdown.onChange(async (value) => {
          this.plugin.settings.updateConfirmation =
            value as UpdateConfirmationMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName('Literature note templates').setHeading();

    this.buildTextField(
      containerEl,
      'Literature note title template',
      'Use forward slashes to organise notes into subfolders, e.g. {{containerTitle}}/{{citekey}}.',
      'literatureNoteTitleTemplate',
    );

    this.buildTextField(
      containerEl,
      'Literature note content template file',
      'Path to a vault file used as the content template for new literature notes.',
      'literatureNoteContentTemplatePath',
    );

    const linksEl = containerEl.createEl('p', {
      cls: 'setting-item-description',
    });
    linksEl.append(
      createSpan({
        text: 'For template variables, helpers, and examples see the ',
      }),
      createEl('a', {
        text: 'Template variables',
        href: `${DOCS_BASE}/templates/variables.md`,
      }),
      createSpan({ text: ', ' }),
      createEl('a', {
        text: 'Template helpers',
        href: `${DOCS_BASE}/templates/helpers.md`,
      }),
      createSpan({ text: ', and ' }),
      createEl('a', {
        text: 'Template examples',
        href: `${DOCS_BASE}/templates/examples.md`,
      }),
      createSpan({ text: ' documentation.' }),
    );

    new Setting(containerEl)
      .setName('Show available variables')
      .setDesc(
        'Display all template variables discovered from your loaded library, including dynamic fields.',
      )
      .addButton((button) => {
        button.setButtonText('Show variables').onClick(() => {
          const variables = this.plugin.libraryService.getTemplateVariables();
          new VariableListModal(this.app, variables).open();
        });
      });
  }

  private renderCitationsSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Markdown citation templates')
      .setHeading();
    containerEl.createEl('p', {
      text: 'You can insert pandoc-style citations rather than literature notes by using the insert citation command.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Citation style preset')
      .setDesc(
        'Select a built-in style or choose "custom" to define your own templates.',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions(CITATION_STYLE_PRESET_LABELS);
        dropdown.setValue(this.plugin.settings.citationStylePreset);
        dropdown.onChange((value) => {
          void (async () => {
            const preset = value as CitationStylePreset;
            this.plugin.settings.citationStylePreset = preset;

            if (preset !== 'custom') {
              const templates = CITATION_STYLE_PRESETS[preset];
              this.plugin.settings.markdownCitationTemplate = templates.primary;
              this.plugin.settings.alternativeMarkdownCitationTemplate =
                templates.alternative;
            }

            await this.plugin.saveSettings();
            this.display();
          })();
        });
      });

    const isCustom = this.plugin.settings.citationStylePreset === 'custom';

    this.buildCitationTemplateField(
      containerEl,
      'Markdown primary citation template',
      'markdownCitationTemplate',
      isCustom,
    );

    this.buildCitationTemplateField(
      containerEl,
      'Markdown secondary citation template',
      'alternativeMarkdownCitationTemplate',
      isCustom,
    );

    new Setting(containerEl)
      .setName('Auto-create literature note on citation')
      .setDesc(
        'When enabled, inserting a citation will also create the literature note if it doesn\u2019t exist.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoCreateNoteOnCitation)
          .onChange(async (value) => {
            this.plugin.settings.autoCreateNoteOnCitation = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Literature note link display template')
      .setDesc(
        'Handlebars template for the display text of inserted literature note links. ' +
          'Leave empty to use defaults (citekey for Markdown links, title for Wiki links). ' +
          'Example: {{authorString}} ({{year}})',
      )
      .addText((text) => {
        text
          .setPlaceholder('{{authorString}} ({{year}})')
          .setValue(this.plugin.settings.literatureNoteLinkDisplayTemplate)
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.literatureNoteLinkDisplayTemplate = value;
              await this.plugin.saveSettings();
            }, 500),
          );
      });

    new Setting(containerEl)
      .setName('Inline citation autocomplete')
      .setDesc(
        'Suggest matching references while typing @ or [@ in the editor. ' +
          'Press Enter to insert the primary citation, Shift+Enter for the alternative format.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableInlineSuggestions)
          .onChange(async (value) => {
            this.plugin.settings.enableInlineSuggestions = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderDisplaySection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Display').setHeading();

    new Setting(containerEl)
      .setName('Sort order')
      .setDesc(
        'Choose how references are sorted in the search modal. Default preserves the original file order.',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions(SORT_ORDER_LABELS);
        dropdown.setValue(this.plugin.settings.referenceListSortOrder);
        dropdown.onChange(async (value) => {
          this.plugin.settings.referenceListSortOrder =
            value as ReferenceListSortOrder;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Bibliography entry template')
      .setDesc(
        'Handlebars template used to render each reference in the References ' +
          'sidebar view. Example: {{authorString}} ({{year}}). {{title}}.',
      )
      .addText((text) => {
        text
          .setPlaceholder('{{authorString}} ({{year}}). {{title}}.')
          .setValue(this.plugin.settings.bibliographyEntryTemplate)
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.bibliographyEntryTemplate =
                value || DEFAULT_SETTINGS.bibliographyEntryTemplate;
              await this.plugin.saveSettings();
            }, 500),
          );
      });
  }

  private buildTextField<K extends keyof CitationsPluginSettingsType>(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: K,
  ): void {
    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    const errorEl = this.createErrorEl(containerEl);
    const save = this.createSaveHandler(key, errorEl);

    setting.addText((component) => {
      const value = this.plugin.settings[key];
      component.setValue(this.settingValueToString(value));
      component.onChange(save);
    });
  }

  private buildCitationTemplateField(
    containerEl: HTMLElement,
    name: string,
    key: 'markdownCitationTemplate' | 'alternativeMarkdownCitationTemplate',
    enabled: boolean,
  ): void {
    const setting = new Setting(containerEl).setName(name);
    if (!enabled) {
      setting.setDesc('Controlled by the active citation style preset.');
    }

    const errorEl = this.createErrorEl(containerEl);
    const save = this.createSaveHandler(key, errorEl);
    const currentValue = this.plugin.settings[key];

    setting.addText((component) => {
      component.setValue(currentValue);
      component.setDisabled(!enabled);
      component.onChange(save);

      if (!enabled) {
        component.inputEl.setCssProps({ opacity: '0.5' });
      }
    });
  }

  private createErrorEl(containerEl: HTMLElement): HTMLElement {
    const errorEl = containerEl.createDiv({
      cls: 'citation-setting-error',
      text: '',
    });
    errorEl.setCssProps({
      color: 'var(--text-error)',
      fontSize: '0.8em',
      marginTop: '4px',
      display: 'none',
    });
    return errorEl;
  }

  private createSaveHandler<K extends keyof CitationsPluginSettingsType>(
    key: K,
    errorEl: HTMLElement,
  ): (value: string) => void {
    return debounce(
      (value: string) => {
        const fieldSchema = SettingsSchema.shape[key];
        const result = fieldSchema.safeParse(value);

        if (result.success) {
          errorEl.setCssProps({ display: 'none' });
          (this.plugin.settings as unknown as Record<string, unknown>)[key] =
            value;
          void this.plugin.saveSettings();
        } else {
          errorEl.setText(result.error.issues[0].message);
          errorEl.setCssProps({ display: 'block' });
        }
      },
      500,
      true,
    );
  }

  private settingValueToString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (value === null || value === undefined) return '';
    return '';
  }
}
