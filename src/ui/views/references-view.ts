import {
  ItemView,
  MarkdownView,
  Notice,
  Platform,
  WorkspaceLeaf,
  setIcon,
  setTooltip,
} from 'obsidian';
import type { Editor } from 'obsidian';
import type { Entry } from '../../core';
import type { ILibraryService, ITemplateService } from '../../container';
import type { CitationsPluginSettings } from '../settings/settings';
import {
  extractCitekeysFromText,
  findCitekeyOccurrences,
} from '../../application/citekey-extractor';
import { LoadingStatus } from '../../library/library-state';

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
  /**
   * Which occurrence the next modifier-click on `citekey` should jump to.
   *
   * Keyed by the note it was established in, not reset on refresh: clicking
   * inside the sidebar can make this leaf the active one, which refreshes the
   * panel — a cycle reset there would pin every click to the first occurrence.
   * A note always has a path here, because an editor without one cannot be
   * recognized on the next click and so never establishes a cycle.
   */
  private jumpCursor: {
    citekey: string;
    filePath: string;
    index: number;
  } | null = null;

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
    // The store fires on every transition (e.g. Loading → Success). Only a
    // completed load changes what we render, so refresh on Success only — and
    // through the debounce, so several quick reloads coalesce into one pass
    // instead of re-reading the note and re-scanning it each time.
    this.unsubscribe = this.deps.libraryService.store.subscribe((state) => {
      if (state.status === LoadingStatus.Success) {
        this.scheduleRefresh();
      }
    });

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
    setTooltip(item, ReferencesView.itemTooltip(found));
    item.createDiv({ cls: 'citation-extended-ref-text', text });
    item.createDiv({
      cls: 'citation-extended-ref-key',
      text: found ? `@${citekey}` : `@${citekey} (not in library)`,
    });

    item.addEventListener('click', (evt: MouseEvent) => {
      // The jump gesture works for a citekey that is missing from the library
      // too — a typo is exactly the one you want to locate in the note.
      if (ReferencesView.isJumpModifier(evt)) {
        evt.preventDefault();
        this.jumpToCitation(citekey);
        return;
      }
      if (found) this.deps.onOpenCitekey(citekey);
    });
  }

  /**
   * True when the click carries the platform's primary modifier — Cmd on
   * macOS, Ctrl elsewhere. Obsidian binds that key to "open in a new tab" for
   * links; inside this panel it is deliberately repurposed for the in-note
   * jump requested in issue #88, so the gesture shadows the host convention
   * rather than following it. Ctrl on macOS is a right-click, so the two
   * platforms cannot share one modifier.
   */
  private static isJumpModifier(evt: MouseEvent): boolean {
    return Platform.isMacOS ? evt.metaKey : evt.ctrlKey;
  }

  private static itemTooltip(found: boolean): string {
    const jump = Platform.isMacOS ? 'Cmd-click' : 'Ctrl-click';
    return found
      ? `Click to open the literature note, ${jump} to find this citation in the note`
      : `${jump} to find this citation in the note`;
  }

  /**
   * The markdown editor the panel's references came from, with its file path.
   *
   * `getActiveViewOfType` follows focus, which moves to this sidebar leaf on
   * click; `workspace.activeEditor` keeps pointing at the last markdown editor
   * (and also covers Canvas text nodes), so it is the reliable fallback. The
   * same two-step chain lives in `ObsidianWorkspaceAccess.getActiveEditor`
   * (src/platform/obsidian-adapter.ts); this view needs the full `Editor` and
   * the file path, neither of which `IEditorProxy` carries, so the chain is
   * kept in step by hand and the two must be changed together.
   *
   * `filePath` is null when the editor has no backing file. That is an absent
   * identity rather than a path, so it is never reported as an empty string,
   * which would compare equal across two unrelated editors.
   */
  private getTargetEditor(): {
    editor: Editor;
    filePath: string | null;
  } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) {
      return { editor: view.editor, filePath: view.file?.path ?? null };
    }
    const active = this.app.workspace.activeEditor;
    if (active?.editor) {
      return { editor: active.editor, filePath: active.file?.path ?? null };
    }
    return null;
  }

  /**
   * Select the next occurrence of `citekey` in the active note and scroll it
   * into view. Repeated calls for the same citekey in the same note advance
   * through its occurrences and wrap around; a different citekey (or a
   * different note) starts again at the first one.
   */
  private jumpToCitation(citekey: string): void {
    const target = this.getTargetEditor();
    if (!target) {
      new Notice('Open a note in the editor to jump to a citation.');
      return;
    }

    const occurrences = findCitekeyOccurrences(
      target.editor.getValue(),
      citekey,
    );
    if (occurrences.length === 0) {
      // Possible when the panel is showing a stale scan, or when the note is
      // open in reading view and was edited elsewhere.
      this.jumpCursor = null;
      new Notice(`No occurrence of @${citekey} found in this note.`);
      return;
    }

    const cursor = this.jumpCursor;
    const index =
      cursor &&
      cursor.citekey === citekey &&
      cursor.filePath === target.filePath
        ? (cursor.index + 1) % occurrences.length
        : 0;
    // A cycle is remembered only for an editor with a file to key it by: an
    // unidentifiable editor restarts at the first occurrence every time,
    // rather than inheriting the position of an unrelated one.
    this.jumpCursor =
      target.filePath === null
        ? null
        : { citekey, filePath: target.filePath, index };

    const from = target.editor.offsetToPos(occurrences[index].start);
    const to = target.editor.offsetToPos(occurrences[index].end);
    target.editor.setSelection(from, to);
    target.editor.scrollIntoView({ from, to }, true);
    target.editor.focus();

    if (occurrences.length > 1) {
      new Notice(`Citation ${index + 1} of ${occurrences.length}`);
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
