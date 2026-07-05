jest.mock('obsidian', () => ({}), { virtual: true });

import { EntryCSLAdapter, EntryDataCSL } from '../../../src/core';

/**
 * A two-level adapter (specialized → EntryCSLAdapter → Entry), the shape a
 * source-specific adapter takes when it builds on an existing format adapter.
 * toJSON must surface getters from EVERY level of the chain — walking only
 * the immediate prototype would drop all inherited CSL fields and render
 * every `entry.*` template variable empty for such adapters.
 */
class TwoLevelAdapter extends EntryCSLAdapter {
  get customField(): string {
    return 'custom-value';
  }
}

const DATA: EntryDataCSL = {
  id: 'smith2020',
  type: 'article-journal',
  title: 'The Art of Code',
  author: [{ given: 'John', family: 'Smith' }],
  issued: { 'date-parts': [[2020, 1, 15]] },
} as unknown as EntryDataCSL;

describe('Entry.toJSON prototype-chain walk', () => {
  it('surfaces getters inherited across multiple prototype levels', () => {
    const json = new TwoLevelAdapter(DATA).toJSON();

    // Own level.
    expect(json.customField).toBe('custom-value');
    // Intermediate level (EntryCSLAdapter getters).
    expect(json.title).toBe('The Art of Code');
    expect(json.id).toBe('smith2020');
    expect(json.authorString).toContain('Smith');
    // Base level (Entry getters).
    expect(json.annotations).toEqual([]);
    expect(json.attachments).toEqual([]);
  });

  it('matches the single-level adapter shape for the same data', () => {
    const direct = new EntryCSLAdapter(DATA).toJSON();
    const derived = new TwoLevelAdapter(DATA).toJSON();

    for (const key of ['title', 'id', 'type', 'authorString']) {
      expect(derived[key]).toEqual(direct[key]);
    }
  });

  it('never leaks the private annotation backing fields', () => {
    const adapter = new TwoLevelAdapter(DATA);
    adapter.setAnnotations(
      [
        {
          id: 'a1',
          type: 'highlight',
          text: 't',
          comment: '',
          color: '',
          colorName: null,
          page: null,
          pageLabel: '',
          tags: [],
          imagePath: null,
          openURI: null,
          sortIndex: '0',
          dateModified: null,
          source: 'zotero',
        },
      ],
      [],
    );
    const json = adapter.toJSON();
    expect(json._annotations).toBeUndefined();
    expect(json._attachments).toBeUndefined();
    expect((json.annotations as unknown[]).length).toBe(1);
  });
});
