jest.mock('obsidian', () => ({}), { virtual: true });

import { EntryCSLAdapter } from '../../../src/core/adapters/csl-adapter';
import type { EntryDataCSL } from '../../../src/core/adapters/csl-adapter';

function adapt(data: Partial<EntryDataCSL>): EntryCSLAdapter {
  return new EntryCSLAdapter({
    id: 'smith2023',
    type: 'article-journal',
    ...data,
  } as EntryDataCSL);
}

describe('EntryCSLAdapter note support', () => {
  it('exposes a CSL `note` (Zotero notes / annotations) via the note getter', () => {
    const entry = adapt({ note: 'A highlighted passage.' });
    expect(entry.note).toBe('A highlighted passage.');
  });

  it('surfaces the note in the template context', () => {
    const entry = adapt({ note: 'Annotation text' });
    expect(entry.toTemplateContext().note).toBe('Annotation text');
  });

  it('returns an empty note string when none is present', () => {
    const entry = adapt({});
    expect(entry.note).toBe('');
  });
});
