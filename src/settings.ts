import {
  App,
  debounce,
  FileSystemAdapter,
  PluginSettingTab,
  Setting,
  Notice,
} from 'obsidian';

import CitationPlugin from './main';
import { DatabaseType, DatabaseConfig } from './types';
import { DataSourceDefinition, MergeStrategy } from './data-source';

const CITATION_DATABASE_FORMAT_LABELS: Record<DatabaseType, string> = {
  'csl-json': 'CSL-JSON',
  biblatex: 'BibLaTeX',
};

import { Entry } from './types';

const MOCK_ENTRY = {
  id: 'mock2024',
  type: 'article-journal',
  abstract: 'This is a mock abstract for preview purposes.',
  authorString: 'John Doe, Jane Smith',
  containerTitle: 'Journal of Mock Data',
  DOI: '10.1234/mock.2024',
  eprint: null,
  eprinttype: null,
  eventPlace: 'New York',
  language: 'en',
  note: 'This is a mock note.',
  page: '1-10',
  publisher: 'Mock Publisher',
  publisherPlace: 'New York',
  source: 'Mock Source',
  title: 'A Mock Article for Preview',
  titleShort: 'Mock Article',
  URL: 'https://example.com/mock',
  series: 'Mock Series',
  volume: '42',
  year: 2024,
  issuedDate: new Date('2024-01-01'),
  zoteroSelectURI: 'zotero://select/items/@mock2024',
  toJSON: function () {
    return this;
  },
} as unknown as Entry;

import { z } from 'zod';

export const SettingsSchema = z.object({
  citationExportPath: z.string(),
  citationExportFormat: z.enum(['csl-json', 'biblatex']),
  literatureNoteTitleTemplate: z.string().min(1),
  literatureNoteFolder: z.string(),
  literatureNoteContentTemplate: z.string().min(1),
  markdownCitationTemplate: z.string().min(1),
  alternativeMarkdownCitationTemplate: z.string().min(1),
  // Multi-source configuration
  databases: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['csl-json', 'biblatex']),
        path: z.string(),
      }),
    )
    .default([]),
  mergeStrategy: z.enum(['last-wins', 'merge']).optional(),
});

export type CitationsPluginSettingsType = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: CitationsPluginSettingsType = {
  citationExportPath: '',
  citationExportFormat: 'csl-json',
  literatureNoteTitleTemplate: '@{{citekey}}',
  literatureNoteFolder: 'Reading notes',
  literatureNoteContentTemplate:
    '---\n' +
    'title: {{quote title}}\n' +
    'authors: {{authorString}}\n' +
    'year: {{year}}\n' +
    '---\n\n',
  markdownCitationTemplate: '[@{{citekey}}]',
  alternativeMarkdownCitationTemplate: '@{{citekey}}',
  mergeStrategy: 'last-wins',
  databases: [],
};

export class CitationsPluginSettings {
  public citationExportPath: string = DEFAULT_SETTINGS.citationExportPath;
  public citationExportFormat: DatabaseType =
    DEFAULT_SETTINGS.citationExportFormat;

  public literatureNoteTitleTemplate: string =
    DEFAULT_SETTINGS.literatureNoteTitleTemplate;
  public literatureNoteFolder: string = DEFAULT_SETTINGS.literatureNoteFolder;
  public literatureNoteContentTemplate: string =
    DEFAULT_SETTINGS.literatureNoteContentTemplate;

  public markdownCitationTemplate: string =
    DEFAULT_SETTINGS.markdownCitationTemplate;
  public alternativeMarkdownCitationTemplate: string =
    DEFAULT_SETTINGS.alternativeMarkdownCitationTemplate;

  public databases: DatabaseConfig[] = DEFAULT_SETTINGS.databases;
  public dataSources?: DataSourceDefinition[];
  public mergeStrategy?: MergeStrategy;
}

export function validateSettings(settings: unknown) {
  return SettingsSchema.safeParse(settings);
}

export class CitationSettingTab extends PluginSettingTab {
  private plugin: CitationPlugin;

  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.setAttr('id', 'zoteroSettingTab');

    new Setting(containerEl).setName('Citation plugin').setHeading();

    this.displayCitationDatabaseSettings(containerEl);
    this.displayLiteratureNoteSettings(containerEl);
    this.displayTemplateSettings(containerEl);
    this.displayMarkdownCitationSettings(containerEl);
  }

  private displayCitationDatabaseSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Citation databases').setHeading();
    containerEl.createEl('p', {
      text: 'Configure one or more citation databases. The plugin will load references from all configured sources.',
      cls: 'setting-item-description',
    });

    const databasesContainer = containerEl.createDiv(
      'citation-databases-container',
    );

    // Render existing databases
    this.plugin.settings.databases.forEach((db, index) => {
      this.renderDatabaseSetting(databasesContainer, db, index);
    });

    // Add new database button
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
              name: `Database ${this.plugin.settings.databases.length + 1}`,
              type: 'csl-json',
              path: '',
            });
            await this.plugin.saveSettings();
            this.display(); // Re-render to show new database
          })();
        });
    });
  }

  private renderDatabaseSetting(
    container: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    const settingDiv = container.createDiv('citation-database-setting');
    settingDiv.setCssProps({
      border: '1px solid var(--background-modifier-border)',
      padding: '10px',
      marginBottom: '10px',
      borderRadius: '4px',
    });

    const header = settingDiv.createDiv('citation-database-header');
    header.setCssProps({
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '10px',
    });

    // Database Name
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
            })();
          });
      });

    // Database Type
    new Setting(settingDiv).setName('Database type').addDropdown((dropdown) => {
      dropdown.addOptions(CITATION_DATABASE_FORMAT_LABELS);
      dropdown.setValue(db.type);
      dropdown.onChange(async (value) => {
        this.plugin.settings.databases[index].type = value as DatabaseType;
        await this.plugin.saveSettings();
      });
    });

    // Database Path
    new Setting(settingDiv)
      .setName('Database path')
      .setDesc('Absolute path or path relative to vault root.')
      .addText((text) => {
        text
          .setPlaceholder('/path/to/export.json')
          .setValue(db.path)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].path = value;
            await this.plugin.saveSettings();
            void this.checkCitationExportPath(value, pathStatusEl);
          });
      });

    const pathStatusEl = settingDiv.createDiv('citation-path-status');
    pathStatusEl.setCssProps({
      fontSize: '0.8em',
      marginTop: '5px',
    });

    // Initial check
    if (db.path) {
      void this.checkCitationExportPath(db.path, pathStatusEl);
    }
  }

  /**
   * Returns true iff the path exists; displays error as a side-effect
   */
  async checkCitationExportPath(
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

  // Legacy method kept for compatibility if needed, but unused in new UI
  showCitationExportPathSuccess(): void {
    // no-op
  }

  private displayLiteratureNoteSettings(containerEl: HTMLElement): void {
    this.buildSetting(
      containerEl,
      'Literature note folder',
      'Save literature note files in this folder within your vault. If empty, notes will be stored in the root directory of the vault.',
      'literatureNoteFolder',
    );

    new Setting(containerEl).setName('Literature note templates').setHeading();

    this.buildSetting(
      containerEl,
      'Literature note title template',
      '',
      'literatureNoteTitleTemplate',
      'text',
      true,
    );

    this.buildSetting(
      containerEl,
      'Literature note content template',
      '',
      'literatureNoteContentTemplate',
      'textarea',
      true,
      true,
    );
  }

  private displayTemplateSettings(containerEl: HTMLElement): void {
    // ... existing implementation ...
    new Setting(containerEl).setName('Templates').setHeading();
    const templateInstructionsEl = containerEl.createEl('p');
    templateInstructionsEl.append(
      createSpan({
        text:
          'The following settings determine how the notes and links created by ' +
          'the plugin will be rendered. You may specify a custom template for ' +
          'each type of content. Templates are interpreted using ',
      }),
    );
    templateInstructionsEl.append(
      createEl('a', {
        text: 'Handlebars',
        href: 'https://handlebarsjs.com/guide/expressions.html',
      }),
    );
    templateInstructionsEl.append(
      createSpan({
        text: ' syntax. You can make reference to the following variables:',
      }),
    );

    const variableContainer = containerEl.createDiv({
      attr: { id: 'citationTemplateVariables' },
    });

    const variables = this.plugin.libraryService.getTemplateVariables();

    // Group variables
    const standardVariables = variables.filter((v) => v.description);
    const otherVariables = variables.filter((v) => !v.description);

    const createVariableList = (vars: typeof variables) => {
      const list = variableContainer.createEl('ul');
      list.setCssProps({
        marginTop: '5px',
        marginBottom: '15px',
      });

      vars.forEach((v) => {
        const item = list.createEl('li');
        item.createEl('code', {
          text: '{{' + v.key + '}}',
        });
        if (v.description) {
          item.createEl('span', {
            text: ` — ${v.description} `,
          });
        }
        if (v.example) {
          item.createEl('span', {
            text: ` (e.g.${v.example})`,
            cls: 'text-muted',
          });
        }
      });
    };

    if (standardVariables.length > 0) {
      variableContainer.createEl('strong', { text: 'Standard variables' });
      createVariableList(standardVariables);
    }

    if (otherVariables.length > 0) {
      variableContainer.createEl('strong', {
        text: 'Detected variables (from library)',
      });
      createVariableList(otherVariables);
    }

    const templateEntryInstructionsEl = containerEl.createEl('p');
    templateEntryInstructionsEl.append(
      createSpan({ text: 'Advanced users may also refer to the ' }),
      createSpan({ text: '{{entry}}', cls: 'text-monospace' }),
      createSpan({
        text:
          ' variable, which contains the full object representation of the ' +
          'reference as used internally by the plugin. See the ',
      }),
      createEl('a', {
        text: 'Template documentation',
        href: 'https://github.com/akhmialeuski/obsidian-citation-extended/blob/master/docs/template-variables.md',
      }),
      createSpan({ text: ' or ' }),
      createEl('a', {
        text: 'README',
        href: 'https://github.com/akhmialeuski/obsidian-citation-extended/blob/master/README.md',
      }),
      createSpan({ text: " for information on this object's structure." }),
    );
  }

  private displayMarkdownCitationSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Markdown citation templates')
      .setHeading();
    containerEl.createEl('p', {
      text: 'You can insert pandoc-style citations rather than literature notes by using the insert citation command. The below options allow customization of the citation format.',
    });

    this.buildSetting(
      containerEl,
      'Markdown primary citation template',
      '',
      'markdownCitationTemplate',
      'text',
      true,
      true,
    );

    this.buildSetting(
      containerEl,
      'Markdown secondary citation template',
      '',
      'alternativeMarkdownCitationTemplate',
      'text',
      true,
      true,
    );
  }

  private buildSetting<K extends keyof CitationsPluginSettingsType>(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: K,
    componentType: 'text' | 'textarea' = 'text',
    showPreview = false,
    useStackedLayout = false,
  ): void {
    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    if (useStackedLayout) {
      setting.settingEl.addClass('citation-setting-stacked');
    }
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

    let previewEl: HTMLElement | null = null;
    let updatePreview: ((value: string) => void) | null = null;

    if (showPreview) {
      const separator = containerEl.createEl('hr');
      separator.setCssProps({
        marginTop: '20px',
        marginBottom: '20px',
        borderColor: 'var(--background-modifier-border)',
      });

      previewEl = containerEl.createDiv({ cls: 'citation-template-preview' });
      previewEl.setCssProps({
        padding: '10px',
        backgroundColor: 'var(--background-secondary)',
        borderRadius: '4px',
        fontFamily: 'var(--font-monospace)',
        whiteSpace: 'pre-wrap',
        fontSize: '0.8em',
      });

      updatePreview = (value: string) => {
        if (!previewEl) return;
        const variables =
          this.plugin.templateService.getTemplateVariables(MOCK_ENTRY);
        try {
          const result = this.plugin.templateService.render(value, variables);
          previewEl.setText(result);
          previewEl.setCssProps({ color: 'var(--text-normal)' });
        } catch (e) {
          previewEl.setText(
            `Error rendering template: ${(e as Error).message} `,
          );
          previewEl.setCssProps({ color: 'var(--text-error)' });
        }
      };

      // Initial render
      const initialValue = this.plugin.settings[key];
      updatePreview(this.settingValueToString(initialValue));
    }

    const save = debounce(
      async (value: string) => {
        const fieldSchema = SettingsSchema.shape[key];
        const result = fieldSchema.safeParse(value);

        if (result.success) {
          errorEl.setCssProps({ display: 'none' });
          (this.plugin.settings as unknown as Record<string, unknown>)[key] =
            value;
          await this.plugin.saveSettings();
        } else {
          errorEl.setText(result.error.issues[0].message);
          errorEl.setCssProps({ display: 'block' });
        }
      },
      500,
      true,
    );

    const onChange = (value: string) => {
      save(value);
      if (updatePreview) updatePreview(value);
    };

    if (componentType === 'text') {
      setting.addText((component) => {
        const value = this.plugin.settings[key];
        component.setValue(this.settingValueToString(value));
        component.onChange(onChange);
      });
    } else if (componentType === 'textarea') {
      setting.addTextArea((component) => {
        const value = this.plugin.settings[key];
        component.setValue(this.settingValueToString(value));
        component.onChange(onChange);
      });
    }
  }

  /**
   * Safely converts a settings value to a string for display in UI components.
   * Handles string, number, boolean, and complex types.
   */
  private settingValueToString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value === null || value === undefined) {
      return '';
    }
    // For arrays and objects, return empty string as they shouldn't be displayed as text
    return '';
  }
}
