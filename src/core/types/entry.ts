import type { TemplateContext } from './template-context';
import type { Annotation, AttachmentRef } from './annotation';

export interface Author {
  given?: string;
  family?: string;
  literal?: string;
}

/** Fields extracted from an entry for full-text search indexing. */
export interface SearchDocument {
  id: string;
  title: string;
  authorString: string;
  year: string;
  zoteroId: string;
  /**
   * Aggregated note/highlight text (truncated). Lets full-text search match
   * phrases that appear only inside Readwise highlights or BibTeX notes.
   */
  notesText: string;
}

/**
 * Per-instance compute-once caches for derived getters (see {@link Entry.memo}).
 * A WeakMap keyed by the entry instance keeps the cache OFF the object itself:
 * it is invisible to object spreads (`toJSON`) and to the pipeline's
 * `Object.assign` cloning (each clone re-derives lazily), and it is collected
 * together with the entry.
 */
const memoStore = new WeakMap<Entry, Map<string, unknown>>();

/**
 * An `Entry` represents a single reference in a reference database.
 * Each entry has a unique identifier, known in most reference managers as its
 * "citekey."
 *
 * Subclasses (adapters) implement raw field access for each bibliography format.
 * This base class provides derived domain methods that encapsulate presentation
 * and transformation logic, keeping callers decoupled from field-level details.
 */
export abstract class Entry {
  /**
   * Compute-once cache for derived getters on sort/search hot paths
   * (authorString, issuedDate, year are called O(N log N) times by sort
   * comparators). The underlying source data is immutable after parsing, so
   * cached values never need invalidation.
   */
  protected memo<T>(key: string, compute: () => T): T {
    let cache = memoStore.get(this);
    if (!cache) {
      cache = new Map<string, unknown>();
      memoStore.set(this, cache);
    }
    if (!cache.has(key)) {
      cache.set(key, compute());
    }
    return cache.get(key) as T;
  }

  /**
   * Unique identifier for the entry (also the citekey).
   */
  public abstract id: string;

  public abstract type: string;

  public abstract abstract?: string;
  public abstract author?: Author[];

  /**
   * A comma-separated list of authors, each of the format `<firstname> <lastname>`.
   */
  public abstract authorString?: string | null;

  /**
   * The name of the container for this reference -- in the case of a book
   * chapter reference, the name of the book; in the case of a journal article,
   * the name of the journal.
   */
  public abstract containerTitle?: string;

  public abstract DOI?: string;
  public abstract files?: string[] | null;

  /**
   * The date of issue. Many references do not contain information about month
   * and day of issue; in this case, the `issuedDate` will contain dummy minimum
   * values for those elements. (A reference which is only encoded as being
   * issued in 2001 is represented here with a date 2001-01-01 00:00:00 UTC.)
   */
  public abstract issuedDate?: Date | null;

  /**
   * Page or page range of the reference.
   */
  public abstract page?: string;
  public abstract title?: string;
  public abstract titleShort?: string;
  public abstract URL?: string;

  public abstract zoteroId?: string;

  public abstract keywords?: string[];

  /**
   * Zotero collection names the entry belongs to. Populated only by formats
   * that carry this information (e.g. Better BibTeX with "Export collections"
   * enabled, which emits a `collections` field). Left undefined otherwise, so
   * it is a concrete optional field on the base rather than an abstract member
   * every adapter must declare.
   */
  public collections?: string[];

  /** Injected annotations (see {@link setAnnotations}). */
  protected _annotations?: Annotation[];
  /** Injected attachments (see {@link setAnnotations}). */
  protected _attachments?: AttachmentRef[];

  /**
   * Source-agnostic annotations for this entry ([] when none). The consumer
   * (templates, notes layer) reads this ONE interface regardless of source.
   *
   * Two population paths, both behind the source boundary:
   * - Adapters whose annotation data lives in the parsed entry (e.g. Readwise
   *   highlights) override this getter.
   * - Sources whose annotations come from a separate call (e.g. Zotero via
   *   Better BibTeX JSON-RPC) inject them with {@link setAnnotations}.
   */
  public get annotations(): Annotation[] {
    return this._annotations ?? [];
  }

  /** Source-agnostic attachments for this entry ([] when none). */
  public get attachments(): AttachmentRef[] {
    return this._attachments ?? [];
  }

  /**
   * Inject externally-fetched annotations/attachments (used by sources whose
   * annotation data is not part of the parsed entry). Adapters that derive
   * annotations from their own data override {@link annotations} instead.
   */
  public setAnnotations(
    annotations: Annotation[],
    attachments: AttachmentRef[],
  ): void {
    this._annotations = annotations;
    this._attachments = attachments;
  }

  public abstract eventPlace?: string;

  public abstract language?: string;

  public abstract source?: string;

  public abstract publisher?: string;
  public abstract publisherPlace?: string;

  public abstract ISBN?: string;
  public abstract series?: string;
  public abstract volume?: string;

  public abstract _sourceDatabase?: string;
  public abstract _compositeCitekey?: string;

  public abstract get citekey(): string;

  /**
   * BibLaTeX-specific properties
   */
  public abstract eprint?: string | null;
  public abstract eprinttype?: string | null;

  protected _year?: string;
  public get year(): number | undefined {
    // Memoized: the (possibly expensive) issuedDate derivation runs at most
    // once, while sort comparators call this getter O(N log N) times.
    return this.memo('year', () =>
      this._year ? parseInt(this._year) : this.issuedDate?.getUTCFullYear(),
    );
  }

  protected _note?: string[];

  /**
   * Decode HTML entities and parser artifacts from bibtex-parser output.
   *
   * The parser produces several encodings depending on input:
   *   \textless / \textgreater  ->  &lt; / &gt;
   *   &lt; / &gt; in input      ->  &amp;lt; / &amp;gt; (double-encoded)
   *   plain < / > in braces     ->  inverted punctuation marks
   */
  protected static decodeHtmlEntities(text: string): string {
    return (
      text
        // Double-encoded entities first
        .replace(/&amp;lt;/g, '<')
        .replace(/&amp;gt;/g, '>')
        .replace(/&amp;amp;/g, '&')
        .replace(/&amp;quot;/g, '"')
        // Single-encoded entities
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Parser artifact: bibtex-parser converts all < / > to inverted punctuation.
        // We convert them back globally. Trade-off: legitimate Spanish punctuation
        // in note fields will also be converted, but this is rare in academic
        // BibTeX data while math expressions (5 < x > 3) are common.
        .replace(/\u00a1/g, '<')
        .replace(/\u00bf/g, '>')
    );
  }

  /**
   * Decode a single note segment: convert parser-produced HTML anchors to
   * Markdown links, then decode HTML entities.
   */
  private static decodeNoteSegment(el: string): string {
    // Convert HTML anchor tags from bibtex-parser to Markdown links.
    // Parser may output <a href> (from \href) or inverted-punctuation variants (from raw HTML).
    el = el.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '[$2]($1)');
    el = el.replace(
      /\u00a1a href="([^"]+)"\u00bf([^\u00a1]*)\u00a1\/a\u00bf/g,
      '[$2]($1)',
    );
    // Decode HTML entities that bibtex-parser may produce
    return Entry.decodeHtmlEntities(el);
  }

  public get note(): string {
    return (
      this._note?.map((el) => Entry.decodeNoteSegment(el)).join('\n\n') || ''
    );
  }

  /**
   * A URI which will open the relevant entry in the Zotero client.
   */
  public get zoteroSelectURI(): string {
    return `zotero://select/items/@${this.citekey}`;
  }

  /**
   * Zotero tags for the entry. Tags are exported as the `keywords` field by
   * Better BibTeX and as `keyword` in CSL-JSON, so `tags` is exposed as a
   * convenience alias over {@link keywords} for templates that prefer the
   * Zotero terminology.
   */
  public get tags(): string[] | undefined {
    return this.keywords;
  }

  // ---------------------------------------------------------------------------
  // Domain convenience methods — encapsulate presentation logic so callers
  // remain decoupled from raw field details.
  // ---------------------------------------------------------------------------

  /**
   * Publication year as a string, or empty string when unavailable.
   */
  public yearString(): string {
    return this.year?.toString() ?? '';
  }

  /**
   * Publication date as an ISO 8601 date string (YYYY-MM-DD), or null
   * when the issued date is not set.
   */
  public dateString(): string | null {
    return this.issuedDate ? this.issuedDate.toISOString().split('T')[0] : null;
  }

  /**
   * Family (or literal) name of the first author, used as a shorthand
   * in templates (e.g. `{{lastname}}`).
   */
  public lastname(): string | undefined {
    return this.author?.[0]?.family ?? this.author?.[0]?.literal;
  }

  /**
   * Display-ready author string, optionally truncated to `maxCount`
   * authors with an "et al." suffix.
   *
   * @param maxCount  Maximum number of authors to include before
   *                  truncating. When omitted or 0, returns the full
   *                  `authorString`.
   */
  public displayAuthors(maxCount?: number): string {
    if (!maxCount || !this.author || this.author.length <= maxCount) {
      return this.authorString || '';
    }
    const names = this.author
      .slice(0, maxCount)
      .map((a) => [a.given, a.family].filter(Boolean).join(' '));
    return names.join(', ') + ' et al.';
  }

  /**
   * UI display key: prefixed with the source database name when the
   * entry was loaded from a multi-database configuration.
   */
  public displayKey(): string {
    const key = this.citekey || this.id;
    return this._sourceDatabase ? `${this._sourceDatabase}:${key}` : key;
  }

  /**
   * Maximum number of characters of aggregated note/highlight text indexed
   * per entry. Caps the search index size for entries with large Readwise
   * highlight collections.
   */
  private static readonly MAX_NOTES_INDEX_CHARS = 5000;

  /**
   * Build the truncated note text used for search indexing WITHOUT decoding
   * the full note. Raw segments are concatenated only up to twice the limit
   * (headroom for decode-time shrinkage), decoded, then truncated — so the
   * regex pipeline never runs over megabytes of highlights when only the
   * first few KB end up in the index. The cut may fall mid-link at the
   * boundary; that is acceptable for index-only text (the `note` getter
   * still returns the fully decoded text for templates).
   */
  protected noteExcerpt(limit: number): string {
    if (!this._note || this._note.length === 0) return '';
    const rawLimit = limit * 2;
    let raw = '';
    for (const el of this._note) {
      if (raw.length > 0) raw += '\n\n';
      // Take only the prefix that still fits: a single multi-megabyte segment
      // (e.g. aggregated Readwise highlights) must not be copied wholesale.
      // Clamp to 0 — the separator above may have just crossed the limit.
      const remaining = Math.max(0, rawLimit - raw.length);
      raw += el.length > remaining ? el.slice(0, remaining) : el;
      if (raw.length >= rawLimit) break;
    }
    return Entry.decodeNoteSegment(raw).slice(0, limit);
  }

  /**
   * Build a flat document suitable for full-text search indexing.
   * Contains only string fields that the search engine needs.
   */
  public toSearchDocument(): SearchDocument {
    return {
      id: this.id,
      title: this.title || '',
      authorString: this.authorString || '',
      year: this.yearString(),
      zoteroId: this.zoteroId || '',
      // Truncated to bound index growth; the full note remains available via
      // the `note` getter for templates.
      notesText: this.noteExcerpt(Entry.MAX_NOTES_INDEX_CHARS),
    };
  }

  /**
   * Build the template context used by Handlebars when rendering
   * literature notes, citations, and titles.
   *
   * Top-level shortcuts provide convenient `{{field}}` access in templates.
   * The nested `entry` object exposes the full serialized entry for advanced
   * templates that need arbitrary fields via `{{entry.someField}}`.
   *
   * @param extras  Optional additional context (e.g. selected editor text).
   */
  public toTemplateContext(extras?: {
    selectedText?: string;
  }): TemplateContext {
    return {
      citekey: this.id,

      abstract: this.abstract,
      authorString: this.authorString,
      containerTitle: this.containerTitle,
      DOI: this.DOI,
      eprint: this.eprint,
      eprinttype: this.eprinttype,
      eventPlace: this.eventPlace,
      ISBN: this.ISBN,
      keywords: this.keywords,
      tags: this.tags,
      collections: this.collections,
      annotations: this.annotations,
      attachments: this.attachments,
      annotationCount: this.annotations.length,
      lastname: this.lastname(),
      language: this.language,
      note: this.note,
      page: this.page,
      publisher: this.publisher,
      publisherPlace: this.publisherPlace,
      series: this.series,
      volume: this.volume,
      source: this.source,
      title: this.title,
      titleShort: this.titleShort,
      type: this.type,
      URL: this.URL,
      year: this.yearString() || undefined,
      zoteroSelectURI: this.zoteroSelectURI,
      zoteroId: this.zoteroId,
      date: this.dateString(),

      selectedText: extras?.selectedText,

      entry: this.toJSON(),
    };
  }

  toJSON(): Record<string, unknown> {
    const jsonObj = { ...this } as Record<string, unknown>;

    // add getter values
    const proto = Object.getPrototypeOf(this) as object;
    Object.entries(Object.getOwnPropertyDescriptors(proto))
      .filter(([, descriptor]) => typeof descriptor.get == 'function')
      .forEach(([key, descriptor]) => {
        if (descriptor && key[0] !== '_') {
          try {
            const val = (this as unknown as Record<string, unknown>)[key];
            jsonObj[key] = val;
          } catch {
            return;
          }
        }
      });

    // Annotations/attachments live on the BASE class (getters + injected
    // backing fields), so surface them explicitly and uniformly here — the
    // getter loop above only sees the immediate adapter prototype, and the
    // spread would otherwise leak the raw `_annotations`/`_attachments`.
    jsonObj.annotations = this.annotations;
    jsonObj.attachments = this.attachments;
    delete jsonObj._annotations;
    delete jsonObj._attachments;

    return jsonObj;
  }
}
