import {
  parseKeyBlocks,
  splitFrontmatter,
  syncFrontmatter,
} from '../../../src/core/sync/frontmatter-sync';

describe('splitFrontmatter', () => {
  it('splits a well-formed frontmatter block from the body', () => {
    const split = splitFrontmatter('---\nyear: 2023\n---\n\nbody text');
    expect(split.found).toBe(true);
    expect(split.frontmatter).toEqual(['year: 2023']);
    expect(split.body).toEqual(['', 'body text']);
  });

  it('reports no frontmatter when the content does not open with a fence', () => {
    const split = splitFrontmatter('# Heading\n\nno frontmatter here');
    expect(split.found).toBe(false);
    expect(split.frontmatter).toEqual([]);
    expect(split.body).toEqual(['# Heading', '', 'no frontmatter here']);
  });

  it('treats an unterminated fence as no frontmatter', () => {
    const split = splitFrontmatter('---\nyear: 2023\nstill open...');
    expect(split.found).toBe(false);
    expect(split.frontmatter).toEqual([]);
    expect(split.body).toEqual(['---', 'year: 2023', 'still open...']);
  });
});

describe('parseKeyBlocks', () => {
  it('captures the prelude before the first key', () => {
    const kb = parseKeyBlocks(['# a comment', '', 'year: 2023']);
    expect(kb.prelude).toEqual(['# a comment', '']);
    expect(kb.order).toEqual(['year']);
  });

  it('attaches list items and continuations to their key', () => {
    const kb = parseKeyBlocks(['tags:', '  - a', '  - b', 'year: 2023']);
    expect(kb.order).toEqual(['tags', 'year']);
    expect(kb.raw.get('tags')).toBe('tags:\n  - a\n  - b');
  });

  it('merges duplicate keys into one block so nothing is lost', () => {
    const kb = parseKeyBlocks(['alias: one', 'year: 2023', 'alias: two']);
    expect(kb.order).toEqual(['alias', 'year']);
    expect(kb.raw.get('alias')).toBe('alias: one\nalias: two');
  });
});

describe('syncFrontmatter', () => {
  it('preserves the prelude and user key order verbatim', () => {
    const rendered = ['year: 2024'];
    const current = ['# my comment', '', 'rating: 5', 'year: 2023'];
    const result = syncFrontmatter(rendered, current, { year: 'year: 2023' });

    expect(result.lines).toEqual([
      '# my comment',
      '',
      'rating: 5',
      'year: 2024',
    ]);
    expect(result.updatedKeys).toEqual(['year']);
  });

  it('appends a brand-new plugin key after the existing keys', () => {
    const rendered = ['year: 2023', 'doi: 10.1/x'];
    const current = ['year: 2023'];
    const result = syncFrontmatter(rendered, current, { year: 'year: 2023' });

    expect(result.lines).toEqual(['year: 2023', 'doi: 10.1/x']);
  });

  it('treats a prototype-colliding key as having no baseline (own-property lookup)', () => {
    // The JSON baseline is a plain object; a frontmatter key literally named
    // `toString` must not read back the inherited Function as its base value.
    const rendered = ['toString: b'];
    const current = ['toString: a'];
    const result = syncFrontmatter(rendered, current, {}); // no own 'toString'

    // base resolves to null (not the inherited function) → a normal
    // no-baseline conflict, and base is a string|null, never a Function.
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ key: 'toString', base: null });
    expect(typeof result.conflicts[0].base).not.toBe('function');
  });

  it('stores a __proto__ key as a normal own baseline key (no pollution)', () => {
    const rendered = ['__proto__: danger'];
    const current: string[] = [];
    const result = syncFrontmatter(rendered, current, null);

    // The baseline must record it as an own key without mutating the object's
    // prototype (a plain object would set the prototype and drop the key).
    expect(
      Object.prototype.hasOwnProperty.call(result.baseline, '__proto__'),
    ).toBe(true);
    expect(Object.getPrototypeOf(result.baseline)).toBeNull();
  });

  it('conflicts on a differing key when there is no baseline', () => {
    const rendered = ['year: 2024'];
    const current = ['year: 2023'];
    const result = syncFrontmatter(rendered, current, null);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ key: 'year', base: null });
    // Safe default keeps the note's value; the theirs variant takes the render.
    expect(result.lines).toEqual(['year: 2023']);
    expect(result.linesTakeTheirs).toEqual(['year: 2024']);
  });

  it('keeps a user edit when the library value is unchanged', () => {
    const rendered = ['year: 2023'];
    const current = ['year: 1999'];
    const result = syncFrontmatter(rendered, current, { year: 'year: 2023' });

    expect(result.conflicts).toEqual([]);
    expect(result.lines).toEqual(['year: 1999']);
  });

  it('records a user-deleted plugin key as a tombstone', () => {
    const rendered = ['year: 2024', 'title: A'];
    const current = ['year: 2024']; // user removed title
    const result = syncFrontmatter(rendered, current, {
      year: 'year: 2024',
      title: 'title: A',
    });

    expect(result.deletedKeys).toContain('title');
    expect(result.lines).toEqual(['year: 2024']);
    expect(result.baseline.title).toBeUndefined();
  });

  it('honours the tombstone even when the library value changed', () => {
    const rendered = ['title: NEW'];
    const current: string[] = []; // title absent
    const result = syncFrontmatter(rendered, current, null, ['title']);

    expect(result.deletedKeys).toContain('title');
    expect(result.lines.join('\n')).not.toContain('title:');
  });

  it('keeps the tombstone when the render temporarily omits the key', () => {
    // Render has no 'title' this cycle (conditional false) — the user's
    // deletion must survive, or the next render re-adds the key.
    const result = syncFrontmatter(['year: 2024'], ['year: 2024'], null, [
      'title',
    ]);

    expect(result.deletedKeys).toContain('title');
  });

  it('releases the tombstone when the user re-adds the key manually', () => {
    // Key present in the note again while omitted from the render.
    const result = syncFrontmatter([], ['title: back again'], null, ['title']);

    expect(result.deletedKeys).not.toContain('title');
    expect(result.lines).toEqual(['title: back again']);
  });
});
