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
  DatabaseType,
  DatabaseConfig,
  DATABASE_TYPE_LABELS,
  DATABASE_FORMATS,
  generateDatabaseId,
  ReadwiseApiClient,
} from '../../core';
import {
  SettingsSchema,
  CitationsPluginSettingsType,
  CitationStylePreset,
  CITATION_STYLE_PRESETS,
  ReadwiseModeSetting,
  READWISE_MODE_LABELS,
} from './settings-schema';
import { ReferenceListSortOrder } from '../modals/sort-entries';
import { VariableListModal } from '../modals/variable-list-modal';

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
    this.renderReadwiseSection(containerEl);
    this.renderLiteratureNotesSection(containerEl);
    this.renderCitationsSection(containerEl);
    this.renderDisplaySection(containerEl);
  }

  // ---------------------------------------------------------------------------
  // Section 1: Citation databases
  // ---------------------------------------------------------------------------

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
              this.plugin.settings.databases.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
              void this.plugin.libraryService.load();
            })();
          });
      });

    new Setting(card).setName('Database type').addDropdown((dropdown) => {
      dropdown.addOptions(DATABASE_TYPE_LABELS);
      dropdown.setValue(db.type);
      dropdown.onChange(async (value) => {
        this.plugin.settings.databases[index].type = value as DatabaseType;
        await this.plugin.saveSettings();
        new Notice('Database format changed. Reloading library…');
        void this.plugin.libraryService.load();
      });
    });

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

  // ---------------------------------------------------------------------------
  // Section 1b: Readwise integration
  // ---------------------------------------------------------------------------

  private renderReadwiseSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Readwise integration').setHeading();
    containerEl.createEl('p', {
      text: 'Connect to Readwise to import highlights and documents as citation entries.',
      cls: 'setting-item-description',
    });

    // Enable toggle
    new Setting(containerEl)
      .setName('Enable Readwise sync')
      .setDesc(
        'When enabled, Readwise data will be loaded as an additional citation database.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.readwiseSyncEnabled)
          .onChange(async (value) => {
            this.plugin.settings.readwiseSyncEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.syncReadwiseDatabaseConfig();
            this.display();
            if (value && this.plugin.settings.readwiseApiToken) {
              void this.plugin.libraryService.load();
            }
          });
      });

    // Only show remaining settings when sync is enabled
    if (!this.plugin.settings.readwiseSyncEnabled) return;

    // Mode selector
    new Setting(containerEl)
      .setName('Readwise mode')
      .setDesc(
        'Choose which Readwise data to import: highlights from books/articles (v2) or Reader documents (v3).',
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions(READWISE_MODE_LABELS);
        dropdown.setValue(this.plugin.settings.readwiseMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.readwiseMode = value as ReadwiseModeSetting;
          await this.plugin.saveSettings();
          this.plugin.syncReadwiseDatabaseConfig();
          void this.plugin.libraryService.load();
        });
      });

    // API token (password field)
    new Setting(containerEl)
      .setName('API token')
      .setDesc(
        'Your Readwise access token. Get it from readwise.io/access_token.',
      )
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
        text
          .setPlaceholder('Enter your Readwise API token')
          .setValue(this.plugin.settings.readwiseApiToken)
          .onChange(
            debounce(async (value: string) => {
              this.plugin.settings.readwiseApiToken = value;
              await this.plugin.saveSettings();
              this.plugin.syncReadwiseDatabaseConfig();
            }, 500),
          );
      });

    // Token validation and sync status row
    const statusEl = containerEl.createDiv('readwise-status');
    statusEl.setCssProps({ fontSize: '0.8em', marginTop: '5px' });

    if (this.plugin.settings.readwiseLastSyncDate) {
      statusEl.setText(
        `Last sync: ${this.plugin.settings.readwiseLastSyncDate}`,
      );
      statusEl.setCssProps({ color: 'var(--text-muted)' });
    }

    // Validate token button
    new Setting(containerEl)
      .setName('Token validation')
      .addButton((button) => {
        button.setButtonText('Validate token').onClick(() => {
          void (async () => {
            if (!this.plugin.settings.readwiseApiToken) {
              new Notice('Please enter an API token first.');
              return;
            }
            statusEl.setText('Validating...');
            statusEl.setCssProps({ color: 'var(--text-muted)' });
            try {
              const client = new ReadwiseApiClient(
                this.plugin.settings.readwiseApiToken,
              );
              const valid = await client.validateToken();
              if (valid) {
                statusEl.setText('Token is valid.');
                statusEl.setCssProps({ color: 'var(--text-success)' });
                new Notice('Readwise token validated successfully.');
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
              if (!this.plugin.settings.readwiseApiToken) {
                new Notice('Please enter an API token first.');
                return;
              }
              this.plugin.syncReadwiseDatabaseConfig();
              new Notice('Syncing Readwise data...');
              await this.plugin.libraryService.load();
              this.plugin.settings.readwiseLastSyncDate =
                new Date().toISOString();
              await this.plugin.saveSettings();
              statusEl.setText(
                `Last sync: ${this.plugin.settings.readwiseLastSyncDate}`,
              );
              statusEl.setCssProps({ color: 'var(--text-muted)' });
              new Notice('Readwise sync complete.');
            })();
          });
      });
  }

  // ---------------------------------------------------------------------------
  // Section 2: Literature notes
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Section 3: Markdown citations
  // ---------------------------------------------------------------------------

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
  }

  // ---------------------------------------------------------------------------
  // Section 4: Display
  // ---------------------------------------------------------------------------

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
  }

  // ---------------------------------------------------------------------------
  // Reusable field builders
  // ---------------------------------------------------------------------------

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
