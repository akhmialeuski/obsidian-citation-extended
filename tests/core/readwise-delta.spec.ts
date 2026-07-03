import {
  isMeaningfulHighlight,
  mergeReadwiseDelta,
  readerChildToItem,
  toEntryDataFromReader,
} from '../../src/core/readwise/readwise-delta';
import {
  READWISE_MODES,
  type ReadwiseEntryData,
  type ReadwiseHighlightItem,
} from '../../src/core/adapters/readwise-adapter';
import type { ReadwiseReaderDocument } from '../../src/core/readwise/readwise-api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHighlight(
  overrides: Partial<ReadwiseHighlightItem> = {},
): ReadwiseHighlightItem {
  return {
    id: 'h1',
    text: 'highlight text',
    note: null,
    location: null,
    locationType: null,
    color: null,
    highlightedAt: null,
    url: null,
    tags: [],
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<ReadwiseEntryData> = {},
): ReadwiseEntryData {
  return {
    mode: READWISE_MODES.Highlights,
    rawId: '1',
    title: 'Book',
    author: 'Author',
    category: 'books',
    sourceUrl: null,
    readwiseUrl: 'https://readwise.io/1',
    coverImageUrl: null,
    summary: null,
    highlightsText: 'highlight text',
    highlights: [makeHighlight()],
    highlightCount: 1,
    tags: [],
    publishedDate: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeReaderDoc(
  overrides: Partial<ReadwiseReaderDocument> = {},
): ReadwiseReaderDocument {
  return {
    id: 'doc-1',
    url: 'https://readwise.io/reader/doc-1',
    source_url: 'https://example.com',
    title: 'Doc',
    author: 'Author',
    source: 'web',
    category: 'articles',
    location: 'later',
    tags: {},
    site_name: null,
    word_count: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    published_date: null,
    summary: null,
    image_url: null,
    content: null,
    html: null,
    parent_id: null,
    reading_progress: 0,
    notes: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mergeReadwiseDelta
// ---------------------------------------------------------------------------

describe('mergeReadwiseDelta', () => {
  it('returns the base unchanged for an empty delta', () => {
    const base = [makeEntry()];
    const result = mergeReadwiseDelta(base, {
      entries: [],
      orphanChildren: [],
    });
    expect(result).toBe(base);
  });

  it('adds entries that are new in the delta', () => {
    const base = [makeEntry({ rawId: '1' })];
    const delta = [makeEntry({ rawId: '2', title: 'New Book' })];

    const result = mergeReadwiseDelta(base, {
      entries: delta,
      orphanChildren: [],
    });

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.rawId).sort()).toEqual(['1', '2']);
  });

  it('merges highlight-mode entries by highlight id (old highlights survive)', () => {
    // v2 Export delta carries ONLY the changed highlights for a book.
    const base = [
      makeEntry({
        rawId: '1',
        highlights: [
          makeHighlight({ id: 'old', text: 'old highlight' }),
          makeHighlight({ id: 'shared', text: 'before edit' }),
        ],
        highlightCount: 2,
      }),
    ];
    const delta = [
      makeEntry({
        rawId: '1',
        title: 'Updated Title',
        highlights: [
          makeHighlight({ id: 'shared', text: 'after edit' }),
          makeHighlight({ id: 'new', text: 'brand new' }),
        ],
        highlightCount: 2,
      }),
    ];

    const [merged] = mergeReadwiseDelta(base, {
      entries: delta,
      orphanChildren: [],
    });

    // Metadata from the delta (newer)...
    expect(merged.title).toBe('Updated Title');
    // ...highlights merged: old survives, shared updated, new added.
    const byId = new Map(merged.highlights!.map((h) => [h.id, h.text]));
    expect(byId.get('old')).toBe('old highlight');
    expect(byId.get('shared')).toBe('after edit');
    expect(byId.get('new')).toBe('brand new');
    expect(merged.highlightCount).toBe(3);
    // Aggregated text rebuilt from the merged items.
    expect(merged.highlightsText).toContain('old highlight');
    expect(merged.highlightsText).toContain('after edit');
    expect(merged.highlightsText).toContain('brand new');
    expect(merged.highlightsText).not.toContain('before edit');
  });

  it('replaces reader-mode entries wholesale (documents come back complete)', () => {
    const base = [
      makeEntry({
        mode: READWISE_MODES.Reader,
        rawId: 'doc-1',
        title: 'Old Title',
        highlights: [makeHighlight({ id: 'kept-by-replacement' })],
      }),
    ];
    const delta = [
      makeEntry({
        mode: READWISE_MODES.Reader,
        rawId: 'doc-1',
        title: 'New Title',
        highlights: [],
        highlightCount: 0,
        highlightsText: null,
      }),
    ];

    const [merged] = mergeReadwiseDelta(base, {
      entries: delta,
      orphanChildren: [],
    });

    expect(merged.title).toBe('New Title');
    expect(merged.highlights).toEqual([]);
  });

  it('folds an orphan reader child into its cached parent', () => {
    const base = [
      makeEntry({
        mode: READWISE_MODES.Reader,
        rawId: 'parent-1',
        title: 'Parent Doc',
        highlights: [],
        highlightCount: 0,
        highlightsText: null,
      }),
    ];
    const child = makeReaderDoc({
      id: 'child-1',
      parent_id: 'parent-1',
      content: 'child highlight text',
      category: 'highlight',
    });

    const [merged] = mergeReadwiseDelta(base, {
      entries: [],
      orphanChildren: [child],
    });

    expect(merged.rawId).toBe('parent-1');
    expect(merged.highlights).toHaveLength(1);
    expect(merged.highlights![0].text).toBe('child highlight text');
    expect(merged.highlightsText).toBe('child highlight text');
    expect(merged.highlightCount).toBe(1);
  });

  it('replaces an existing highlight when the orphan child id matches', () => {
    const base = [
      makeEntry({
        mode: READWISE_MODES.Reader,
        rawId: 'parent-1',
        highlights: [makeHighlight({ id: 'child-1', text: 'old text' })],
      }),
    ];
    const child = makeReaderDoc({
      id: 'child-1',
      parent_id: 'parent-1',
      content: 'edited text',
    });

    const [merged] = mergeReadwiseDelta(base, {
      entries: [],
      orphanChildren: [child],
    });

    expect(merged.highlights).toHaveLength(1);
    expect(merged.highlights![0].text).toBe('edited text');
  });

  it('keeps a true orphan (no parent even in cache) as a standalone entry', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const base = [makeEntry({ rawId: '1' })];
    const child = makeReaderDoc({
      id: 'lonely',
      parent_id: 'missing-parent',
      content: 'text',
    });

    const result = mergeReadwiseDelta(base, {
      entries: [],
      orphanChildren: [child],
    });
    warnSpy.mockRestore();

    expect(result).toHaveLength(2);
    const standalone = result.find((e) => e.rawId === 'lonely');
    expect(standalone).toBeDefined();
    expect(standalone!.mode).toBe(READWISE_MODES.Reader);
  });

  it('skips meaningless orphan children (no text, no note)', () => {
    const base = [
      makeEntry({
        mode: READWISE_MODES.Reader,
        rawId: 'parent-1',
        highlights: [],
        highlightCount: 0,
      }),
    ];
    const child = makeReaderDoc({
      id: 'empty-child',
      parent_id: 'parent-1',
      content: '   ',
      notes: '',
    });

    const [merged] = mergeReadwiseDelta(base, {
      entries: [],
      orphanChildren: [child],
    });

    expect(merged.highlights).toEqual([]);
  });

  it('is idempotent: re-applying the same delta yields the same result', () => {
    const base = [makeEntry({ rawId: '1' })];
    const delta = {
      entries: [
        makeEntry({
          rawId: '1',
          highlights: [makeHighlight({ id: 'new', text: 'added' })],
        }),
      ],
      orphanChildren: [],
    };

    const once = mergeReadwiseDelta(base, delta);
    const twice = mergeReadwiseDelta(once, delta);

    expect(twice).toEqual(once);
  });
});

// ---------------------------------------------------------------------------
// Shared conversion helpers
// ---------------------------------------------------------------------------

describe('readwise-delta helpers', () => {
  it('isMeaningfulHighlight accepts text or note, rejects blanks', () => {
    expect(isMeaningfulHighlight(makeHighlight({ text: 'x' }))).toBe(true);
    expect(
      isMeaningfulHighlight(makeHighlight({ text: ' ', note: 'note' })),
    ).toBe(true);
    expect(
      isMeaningfulHighlight(makeHighlight({ text: ' ', note: null })),
    ).toBe(false);
  });

  it('readerChildToItem maps child document fields', () => {
    const item = readerChildToItem(
      makeReaderDoc({
        id: 'c1',
        content: 'text',
        notes: 'note',
        tags: { tag1: {} },
        source_url: 'https://src',
      }),
    );
    expect(item).toMatchObject({
      id: 'c1',
      text: 'text',
      note: 'note',
      tags: ['tag1'],
      url: 'https://src',
    });
  });

  it('readerChildToItem falls back to tag-stripped HTML when content is absent', () => {
    const fromHtmlContent = readerChildToItem(
      makeReaderDoc({
        id: 'c-html',
        content: null,
        html_content: '<p>First &amp; second&nbsp;part</p>\n<p>tail</p>',
      }),
    );
    expect(fromHtmlContent.text).toBe('First & second part tail');

    const fromHtml = readerChildToItem(
      makeReaderDoc({
        id: 'c-html2',
        content: null,
        html: '<blockquote>quoted &lt;text&gt;</blockquote>',
      }),
    );
    expect(fromHtml.text).toBe('quoted <text>');
  });

  it('readerChildToItem prefers content over the HTML variants', () => {
    const item = readerChildToItem(
      makeReaderDoc({
        id: 'c-both',
        content: 'plain content',
        html_content: '<p>html content</p>',
      }),
    );
    expect(item.text).toBe('plain content');
  });

  it('readerChildToItem yields empty text when no content variant exists', () => {
    const item = readerChildToItem(
      makeReaderDoc({ id: 'c-none', content: null, html: null }),
    );
    expect(item.text).toBe('');
    expect(isMeaningfulHighlight(item)).toBe(false);
  });

  it('toEntryDataFromReader maps document fields and guards null tags', () => {
    const data = toEntryDataFromReader(
      makeReaderDoc({
        id: 'd1',
        title: 'T',
        tags: null as unknown as Record<string, unknown>,
        word_count: 1234,
        location: 'archive',
      }),
    );
    expect(data.mode).toBe(READWISE_MODES.Reader);
    expect(data.rawId).toBe('d1');
    expect(data.tags).toEqual([]);
    expect(data.wordCount).toBe(1234);
    expect(data.readerLocation).toBe('archive');
  });
});
