import {
  ItemView,
  MarkdownView,
  Notice,
  WorkspaceLeaf,
  setIcon,
} from 'obsidian';
import type { Entry } from '../../core';
import type { ILibraryService, ITemplateService } from '../../container';
import type { CitationsPluginSettings } from '../settings/settings';
import { extractCitekeysFromText } from '../../application/citekey-extractor';

/** Stable identifier used to register and reveal the references leaf. */
export const REFERENCES_VIEW_TYPE = 'citation-extended-references';

/** Debounce for live editor updates so typing does not re-scan on every key. */
const EDITOR_REFRESH_DEBOUNCE_MS = 500;

/** Dependencies the view needs, kept free of the concrete plugin class. */
export interface ReferencesViewDeps {
  readonly libraryService: ILibraryService;
  readonly templateService: ITemplateService;
  readonly settings: CitationsPluginSettings;
  /** Open (or create) the literature note for a citekey. */
  readonly onOpenCitekey: (citekey: string) => void;
}

/**
 * Sidebar view that lists every reference cited in the active note, rendered
 * with the configured bibliography template. Mirrors the "reference list"
 * feature users reach for in Pandoc-oriented plugins: see at a glance what a
 * document cites, jump to a literature note, or copy a formatted bibliography.
 */
export class ReferencesView extends ItemView {
  private unsubscribe: (() => void) | null = null;
  private refreshTimer: number | null = null;
  /** Rendered reference strings of the last refresh, for the copy button. */
  private lastRendered: string[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private deps: ReferencesViewDeps,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return REFERENCES_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'References';
  }

  getIcon(): string {
    return 'quote-glyph';
  }

  async onOpen(): Promise<void> {
    // Refresh when the user switches notes, edits the active note (debounced),
    // or the library finishes (re)loading.
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => void this.refresh()),
    );
    this.registerEvent(
      this.app.workspace.on('editor-change', () => this.scheduleRefresh()),
    );
    this.unsubscribe = this.deps.libraryService.store.subscribe(
      () => void this.refresh(),
    );

    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, EDITOR_REFRESH_DEBOUNCE_MS);
  }

  /** Read the active markdown content (live editor first, then disk). */
  private async getActiveContent(): Promise<string | null> {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView?.editor) {
      return mdView.editor.getValue();
    }
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') return null;
    return this.app.vault.cachedRead(file);
  }

  private async refresh(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('citation-extended-references');

    const library = this.deps.libraryService.library;
    if (!library) {
      this.renderMessage(container, 'Citation library is not loaded yet.');
      return;
    }

    const content = await this.getActiveContent();
    if (content === null) {
      this.renderMessage(container, 'Open a note to see its references.');
      return;
    }

    const citekeys = extractCitekeysFromText(content);
    if (citekeys.length === 0) {
      this.renderMessage(container, 'No citations found in this note.');
      return;
    }

    this.renderHeader(container, citekeys.length);

    const listEl = container.createDiv({ cls: 'citation-extended-ref-list' });
    this.lastRendered = [];

    for (const citekey of citekeys) {
      const entry = library.entries[citekey];
      const rendered = this.renderReferenceText(entry, citekey);
      this.lastRendered.push(rendered);
      this.renderReferenceItem(listEl, citekey, rendered, entry !== undefined);
    }
  }

  private renderHeader(container: HTMLElement, count: number): void {
    const header = container.createDiv({ cls: 'citation-extended-ref-header' });
    header.createSpan({
      cls: 'citation-extended-ref-count',
      text: `${count} reference${count === 1 ? '' : 's'}`,
    });

    const copyBtn = header.createEl('button', {
      cls: 'citation-extended-ref-copy',
      attr: { 'aria-label': 'Copy bibliography' },
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', () => void this.copyBibliography());
  }

  private renderReferenceItem(
    listEl: HTMLElement,
    citekey: string,
    text: string,
    found: boolean,
  ): void {
    const item = listEl.createDiv({
      cls: found
        ? 'citation-extended-ref-item'
        : 'citation-extended-ref-item is-missing',
    });
    item.createDiv({ cls: 'citation-extended-ref-text', text });
    item.createDiv({
      cls: 'citation-extended-ref-key',
      text: found ? `@${citekey}` : `@${citekey} (not in library)`,
    });

    if (found) {
      item.addEventListener('click', () => this.deps.onOpenCitekey(citekey));
    }
  }

  private renderReferenceText(
    entry: Entry | undefined,
    citekey: string,
  ): string {
    if (!entry) return citekey;
    const ctx = entry.toTemplateContext();
    const result = this.deps.templateService.render(
      this.deps.settings.bibliographyEntryTemplate,
      ctx,
    );
    const text = result.ok ? result.value.trim() : '';
    return text || entry.title || citekey;
  }

  private renderMessage(container: HTMLElement, message: string): void {
    container.createDiv({
      cls: 'citation-extended-ref-empty',
      text: message,
    });
  }

  private async copyBibliography(): Promise<void> {
    if (this.lastRendered.length === 0) return;
    const text = this.lastRendered.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      new Notice('Bibliography copied to clipboard');
    } catch (e) {
      console.error('Citation references view: failed to copy', e);
      new Notice('Failed to copy bibliography');
    }
  }
}
