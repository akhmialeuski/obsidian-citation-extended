import {
  compareSortIndex,
  normalizeZoteroAttachments,
  zoteroColorName,
  ZOTERO_ANNOTATION_COLOR_NAMES,
} from '../../../src/core/zotero/zotero-annotations';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HIGHLIGHT = {
  key: 'ANNOT001',
  annotationType: 'highlight',
  annotationText: 'A key finding.',
  annotationComment: 'Important!',
  annotationColor: '#ffd400',
  annotationPageLabel: '12',
  annotationSortIndex: '00011|001234|00100',
  annotationPosition: { pageIndex: 11, rects: [[1, 2, 3, 4]] },
  dateModified: '2026-01-15T10:30:00Z',
  tags: [{ tag: 'method' }, { tag: 'key-result' }],
};

const ATTACHMENT = {
  open: 'zotero://open-pdf/library/items/ATTKEY01',
  path: '/home/user/Zotero/storage/ATTKEY01/Smith - 2023 - Paper.pdf',
  annotations: [HIGHLIGHT],
};

// ---------------------------------------------------------------------------
// zoteroColorName
// ---------------------------------------------------------------------------

describe('zoteroColorName', () => {
  it.each(Object.entries(ZOTERO_ANNOTATION_COLOR_NAMES))(
    'maps %s to %s',
    (hex, name) => {
      expect(zoteroColorName(hex)).toBe(name);
    },
  );

  it('is case-insensitive', () => {
    expect(zoteroColorName('#FFD400')).toBe('yellow');
  });

  it('returns null for unknown colors and missing values', () => {
    expect(zoteroColorName('#123456')).toBeNull();
    expect(zoteroColorName(undefined)).toBeNull();
    expect(zoteroColorName('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeZoteroAttachments
// ---------------------------------------------------------------------------

describe('compareSortIndex', () => {
  it('orders by UTF-16 code unit (Zotero byte order), not locale', () => {
    expect(compareSortIndex('00003|0|0', '00020|0|0')).toBeLessThan(0);
    expect(compareSortIndex('00020|0|0', '00003|0|0')).toBeGreaterThan(0);
    expect(compareSortIndex('00003|0|0', '00003|0|0')).toBe(0);
    // The separator '|' (U+007C) sorts after digits, so a shorter leading
    // segment orders before a longer one — the reading order Zotero intends.
    expect(compareSortIndex('00003', '00003|5')).toBeLessThan(0);
  });

  it('matches raw code-unit comparison for a shuffled list', () => {
    const idx = [
      '00020|0|0',
      '00003|0|0',
      '00003|5|0',
      '00003|0|9',
      '00100|0|0',
    ];
    const byHelper = [...idx].sort(compareSortIndex);
    const byCodeUnit = [...idx].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(byHelper).toEqual(byCodeUnit);
  });
});

describe('normalizeZoteroAttachments', () => {
  it('normalizes a highlight annotation with all fields', () => {
    const { attachments, annotations } = normalizeZoteroAttachments([
      ATTACHMENT,
    ]);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toEqual({
      id: 'ATTKEY01',
      path: '/home/user/Zotero/storage/ATTKEY01/Smith - 2023 - Paper.pdf',
      title: 'Smith - 2023 - Paper',
      openURI: 'zotero://open-pdf/library/items/ATTKEY01',
      annotationCount: 1,
    });

    expect(annotations).toHaveLength(1);
    const a = annotations[0];
    expect(a.id).toBe('ANNOT001');
    expect(a.type).toBe('highlight');
    expect(a.text).toBe('A key finding.');
    expect(a.comment).toBe('Important!');
    expect(a.color).toBe('#ffd400');
    expect(a.colorName).toBe('yellow');
    expect(a.page).toBe(12);
    expect(a.pageLabel).toBe('12');
    expect(a.sortIndex).toBe('00011|001234|00100');
    expect(a.dateModified).toBe('2026-01-15T10:30:00Z');
    expect(a.tags).toEqual(['method', 'key-result']);
    expect(a.imagePath).toBeNull();
    expect(a.source).toBe('zotero');
    expect(a.openURI).toBe(
      'zotero://open-pdf/library/items/ATTKEY01?page=12&annotation=ANNOT001',
    );
  });

  it('derives the page from a JSON-string position', () => {
    const { annotations } = normalizeZoteroAttachments([
      {
        ...ATTACHMENT,
        annotations: [
          {
            ...HIGHLIGHT,
            annotationPosition: JSON.stringify({ pageIndex: 4 }),
          },
        ],
      },
    ]);
    expect(annotations[0].page).toBe(5);
  });

  it('falls back to a numeric page label when position is missing', () => {
    const { annotations } = normalizeZoteroAttachments([
      {
        ...ATTACHMENT,
        annotations: [
          {
            ...HIGHLIGHT,
            annotationPosition: undefined,
            annotationPageLabel: '42',
          },
        ],
      },
    ]);
    expect(annotations[0].page).toBe(42);
  });

  it('keeps page null for non-numeric labels (roman numerals)', () => {
    const { annotations } = normalizeZoteroAttachments([
      {
        ...ATTACHMENT,
        annotations: [
          {
            ...HIGHLIGHT,
            annotationPosition: 'not-json',
            annotationPageLabel: 'xii',
          },
        ],
      },
    ]);
    expect(annotations[0].page).toBeNull();
    expect(annotations[0].pageLabel).toBe('xii');
    expect(annotations[0].openURI).toBe(
      'zotero://open-pdf/library/items/ATTKEY01?annotation=ANNOT001',
    );
  });

  it('derives the attachment key from a storage path when open is absent', () => {
    const { attachments, annotations } = normalizeZoteroAttachments([
      {
        path: 'C:\\Users\\u\\Zotero\\storage\\WINKEY99\\file.pdf',
        annotations: [HIGHLIGHT],
      },
    ]);
    expect(attachments[0].id).toBe('WINKEY99');
    expect(annotations[0].openURI).toBe(
      'zotero://open-pdf/library/items/WINKEY99?page=12&annotation=ANNOT001',
    );
  });

  it('produces no deep link when neither open URI nor storage key exist', () => {
    const { attachments, annotations } = normalizeZoteroAttachments([
      { path: '/plain/dir/file.pdf', annotations: [HIGHLIGHT] },
    ]);
    expect(attachments[0].id).toBeNull();
    expect(annotations[0].openURI).toBeNull();
  });

  it('keeps image annotation metadata', () => {
    const { annotations } = normalizeZoteroAttachments([
      {
        ...ATTACHMENT,
        annotations: [
          {
            key: 'IMG00001',
            annotationType: 'image',
            annotationImagePath: '/cache/library/IMG00001.png',
            annotationPosition: { pageIndex: 2 },
          },
        ],
      },
    ]);
    const a = annotations[0];
    expect(a.type).toBe('image');
    expect(a.text).toBe('');
    expect(a.imagePath).toBe('/cache/library/IMG00001.png');
    expect(a.page).toBe(3);
  });

  it('sorts annotations by sortIndex within an attachment', () => {
    const { annotations } = normalizeZoteroAttachments([
      {
        ...ATTACHMENT,
        annotations: [
          { ...HIGHLIGHT, key: 'B', annotationSortIndex: '00020|0|0' },
          { ...HIGHLIGHT, key: 'A', annotationSortIndex: '00003|0|0' },
        ],
      },
    ]);
    expect(annotations.map((a) => a.id)).toEqual(['A', 'B']);
  });

  it('accepts string tags and skips malformed tag entries', () => {
    const { annotations } = normalizeZoteroAttachments([
      {
        ...ATTACHMENT,
        annotations: [
          { ...HIGHLIGHT, tags: ['plain', { tag: 'objtag' }, 42, {}] },
        ],
      },
    ]);
    expect(annotations[0].tags).toEqual(['plain', 'objtag']);
  });

  it('counts annotations per attachment', () => {
    const { attachments, annotations } = normalizeZoteroAttachments([
      { ...ATTACHMENT, annotations: [HIGHLIGHT, { ...HIGHLIGHT, key: 'X' }] },
      { open: 'zotero://open-pdf/library/items/OTHER111', annotations: [] },
    ]);
    expect(attachments.map((a) => a.annotationCount)).toEqual([2, 0]);
    expect(annotations).toHaveLength(2);
  });

  it('tolerates malformed input without throwing', () => {
    expect(normalizeZoteroAttachments(null)).toEqual({
      attachments: [],
      annotations: [],
    });
    expect(normalizeZoteroAttachments('nope')).toEqual({
      attachments: [],
      annotations: [],
    });
    expect(
      normalizeZoteroAttachments([null, 42, { annotations: 'bad' }]),
    ).toEqual({
      attachments: [
        {
          id: null,
          path: null,
          title: null,
          openURI: null,
          annotationCount: 0,
        },
      ],
      annotations: [],
    });
  });
});
