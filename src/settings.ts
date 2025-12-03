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
  year: 2024,
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
    'title: {{title}}\n' +
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

    containerEl.createEl('h2', { text: 'Citation plugin settings' });

    this.displayCitationDatabaseSettings(containerEl);
    this.displayLiteratureNoteSettings(containerEl);
    this.displayTemplateSettings(containerEl);
    this.displayMarkdownCitationSettings(containerEl);
  }

  private displayCitationDatabaseSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Citation Databases' });
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
        .setButtonText('Add Database')
        .setCta()
        .onClick(async () => {
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
        });
    });
  }

  private renderDatabaseSetting(
    container: HTMLElement,
    db: DatabaseConfig,
    index: number,
  ): void {
    const settingDiv = container.createDiv('citation-database-setting');
    settingDiv.style.border = '1px solid var(--background-modifier-border)';
    settingDiv.style.padding = '10px';
    settingDiv.style.marginBottom = '10px';
    settingDiv.style.borderRadius = '4px';

    const header = settingDiv.createDiv('citation-database-header');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '10px';

    // Database Name
    new Setting(header)
      .setName(`Database ${index + 1}`)
      .addText((text) => {
        text
          .setPlaceholder('Friendly Name')
          .setValue(db.name)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].name = value;
            await this.plugin.saveSettings();
          });
      })
      .addExtraButton((button) => {
        button
          .setIcon('trash')
          .setTooltip('Remove Database')
          .onClick(async () => {
            this.plugin.settings.databases.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Database Type
    new Setting(settingDiv).setName('Database Type').addDropdown((dropdown) => {
      dropdown.addOptions(CITATION_DATABASE_FORMAT_LABELS);
      dropdown.setValue(db.type);
      dropdown.onChange(async (value) => {
        this.plugin.settings.databases[index].type = value as DatabaseType;
        await this.plugin.saveSettings();
      });
    });

    // Database Path
    new Setting(settingDiv)
      .setName('Database Path')
      .setDesc('Absolute path or path relative to vault root.')
      .addText((text) => {
        text
          .setPlaceholder('/path/to/export.json')
          .setValue(db.path)
          .onChange(async (value) => {
            this.plugin.settings.databases[index].path = value;
            await this.plugin.saveSettings();
            this.checkCitationExportPath(value, pathStatusEl);
          });
      });

    const pathStatusEl = settingDiv.createDiv('citation-path-status');
    pathStatusEl.style.fontSize = '0.8em';
    pathStatusEl.style.marginTop = '5px';

    // Initial check
    if (db.path) {
      this.checkCitationExportPath(db.path, pathStatusEl);
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
    statusEl.style.color = 'var(--text-muted)';

    try {
      await FileSystemAdapter.readLocalFile(
        this.plugin.libraryService.resolveLibraryPath(filePath),
      );
      statusEl.setText('Path verified.');
      statusEl.style.color = 'var(--text-success)';
      return true;
    } catch {
      statusEl.setText('File not found.');
      statusEl.style.color = 'var(--text-error)';
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

    containerEl.createEl('h3', { text: 'Literature note templates' });

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
    containerEl.createEl('h3', { text: 'Template settings' });
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
      list.style.marginTop = '5px';
      list.style.marginBottom = '15px';

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
      variableContainer.createEl('strong', { text: 'Standard Variables' });
      createVariableList(standardVariables);
    }

    if (otherVariables.length > 0) {
      variableContainer.createEl('strong', {
        text: 'Detected Variables (from library)',
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
        text: 'plugin documentation',
        href: 'http://www.foldl.me/obsidian-citation-plugin/classes/entry.html',
      }),
      createSpan({ text: " for information on this object's structure." }),
    );
  }

  private displayMarkdownCitationSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Markdown citation templates' });
    containerEl.createEl('p', {
      text: 'You can insert Pandoc-style Markdown citations rather than literature notes by using the "Insert Markdown citation" command. The below options allow customization of the Markdown citation format.',
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
    errorEl.style.color = 'var(--text-error)';
    errorEl.style.fontSize = '0.8em';
    errorEl.style.marginTop = '4px';
    errorEl.style.display = 'none';

    let previewEl: HTMLElement | null = null;
    let updatePreview: ((value: string) => void) | null = null;

    if (showPreview) {
      previewEl = containerEl.createDiv({ cls: 'citation-template-preview' });
      previewEl.style.padding = '10px';
      previewEl.style.backgroundColor = 'var(--background-secondary)';
      previewEl.style.borderRadius = '4px';
      previewEl.style.marginTop = '5px';
      previewEl.style.fontFamily = 'var(--font-monospace)';
      previewEl.style.whiteSpace = 'pre-wrap';
      previewEl.style.fontSize = '0.8em';

      updatePreview = (value: string) => {
        if (!previewEl) return;
        const variables =
          this.plugin.templateService.getTemplateVariables(MOCK_ENTRY);
        try {
          const result = this.plugin.templateService.render(value, variables);
          previewEl.setText(result);
          previewEl.style.color = 'var(--text-normal)';
        } catch (e) {
          previewEl.setText(
            `Error rendering template: ${(e as Error).message} `,
          );
          previewEl.style.color = 'var(--text-error)';
        }
      };

      // Initial render
      updatePreview(String(this.plugin.settings[key]));
    }

    const save = debounce(
      async (value: string) => {
        const fieldSchema = SettingsSchema.shape[key];
        const result = fieldSchema.safeParse(value);

        if (result.success) {
          errorEl.style.display = 'none';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.plugin.settings as any)[key] = value;
          await this.plugin.saveSettings();
        } else {
          errorEl.setText(result.error.issues[0].message);
          errorEl.style.display = 'block';
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
        component.setValue(String(this.plugin.settings[key]));
        component.onChange(onChange);
      });
    } else if (componentType === 'textarea') {
      setting.addTextArea((component) => {
        component.setValue(String(this.plugin.settings[key]));
        component.onChange(onChange);
      });
    }
  }
}
