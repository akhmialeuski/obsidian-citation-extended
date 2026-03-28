import type {
  IVaultAccess,
  INotificationService,
} from '../platform/platform-adapter';
import type { CitationsPluginSettings } from '../ui/settings/settings';
import { DEFAULT_CONTENT_TEMPLATE } from '../ui/settings/settings-schema';

/**
 * Resolves the content template string for literature note creation.
 *
 * Reads from a vault file configured in settings, handles migration of
 * legacy inline templates, and ensures a default template exists for
 * new installations.
 */
export interface IContentTemplateResolver {
  /**
   * Resolve the content template string.
   * Reads from the configured vault file, falling back to the default
   * template if the file is missing.
   */
  resolve(): Promise<string>;

  /** Migrate a legacy inline content template to a vault file. */
  migrateInlineToFile(): Promise<void>;

  /** Create a default template file for new installations. */
  ensureDefaultTemplate(): Promise<void>;
}

const DEFAULT_TEMPLATE_PATH = 'citation-content-template.md';

export class ContentTemplateResolver implements IContentTemplateResolver {
  constructor(
    private vault: IVaultAccess,
    private notifications: INotificationService,
    private settings: CitationsPluginSettings,
    private normalizePath: (path: string) => string,
    private saveSettings: () => Promise<void>,
  ) {}

  async resolve(): Promise<string> {
    const templatePath = this.settings.literatureNoteContentTemplatePath;
    if (templatePath) {
      const file = this.vault.getAbstractFileByPath(
        this.normalizePath(templatePath),
      );
      if (file && this.vault.isFile(file)) {
        return this.vault.read(file);
      }
      this.notifications.show(
        `Citations: template file not found at "${templatePath}". Please check the path in settings.`,
      );
    }
    return DEFAULT_CONTENT_TEMPLATE;
  }

  async migrateInlineToFile(): Promise<void> {
    const templateContent = this.settings.literatureNoteContentTemplate;
    if (!templateContent) return;

    const filePath = DEFAULT_TEMPLATE_PATH;
    const existingFile = this.vault.getAbstractFileByPath(
      this.normalizePath(filePath),
    );

    if (!existingFile) {
      try {
        await this.vault.create(filePath, templateContent);
        console.debug(
          `Citations plugin: Migrated inline template to ${filePath}`,
        );
      } catch (e) {
        console.warn('Citations plugin: Failed to migrate inline template:', e);
        return;
      }
    }

    this.settings.literatureNoteContentTemplatePath = filePath;
    this.settings.literatureNoteContentTemplate = '';
    await this.saveSettings();
  }

  async ensureDefaultTemplate(): Promise<void> {
    const filePath = DEFAULT_TEMPLATE_PATH;
    const existingFile = this.vault.getAbstractFileByPath(
      this.normalizePath(filePath),
    );

    if (!existingFile) {
      try {
        await this.vault.create(filePath, DEFAULT_CONTENT_TEMPLATE);
        console.debug(
          `Citations plugin: Created default template at ${filePath}`,
        );
      } catch (e) {
        console.warn('Citations plugin: Failed to create default template:', e);
        return;
      }
    }

    this.settings.literatureNoteContentTemplatePath = filePath;
    await this.saveSettings();
  }
}
