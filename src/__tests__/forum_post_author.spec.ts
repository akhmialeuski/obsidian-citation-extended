/**
 * Tests for Forum Post / non-standard author handling (GitHub issue #210).
 *
 * Forum posts, YouTube videos, podcasts use author formats like
 * "firstname lastname [@username]" which are stored as `literal` in CSL-JSON.
 * BibLaTeX stores them via the `literal` field on creator objects.
 */
import { EntryCSLAdapter, EntryDataCSL } from '../core';

describe('Forum Post and non-standard author types (#210)', () => {
  it('handles Forum Post author with [@username] format via literal', () => {
    const data = {
      id: 'forum-post',
      type: 'post',
      author: [{ literal: 'John Doe [@johndoe]' }],
      title: 'Forum Post Title',
    } as unknown as EntryDataCSL;

    const entry = new EntryCSLAdapter(data);
    expect(entry.authorString).toBe('John Doe [@johndoe]');
  });

  it('handles mixed literal and given/family authors', () => {
    const data = {
      id: 'mixed-authors',
      type: 'post',
      author: [
        { literal: 'Organization Name' },
        { given: 'Jane', family: 'Smith' },
      ],
      title: 'Mixed Authors Post',
    } as unknown as EntryDataCSL;

    const entry = new EntryCSLAdapter(data);
    expect(entry.authorString).toBe('Organization Name, Jane Smith');
  });

  it('handles author with only given name (no family)', () => {
    const data = {
      id: 'given-only',
      type: 'post',
      author: [{ given: 'Madonna' }],
      title: 'Single Name Author',
    } as unknown as EntryDataCSL;

    const entry = new EntryCSLAdapter(data);
    expect(entry.authorString).toBe('Madonna');
  });

  it('handles author with only family name (no given)', () => {
    const data = {
      id: 'family-only',
      type: 'post',
      author: [{ family: 'TheOrganization' }],
      title: 'Org Author',
    } as unknown as EntryDataCSL;

    const entry = new EntryCSLAdapter(data);
    expect(entry.authorString).toBe('TheOrganization');
  });

  it('returns null when no author or editor is present', () => {
    const data = {
      id: 'no-author',
      type: 'post',
      title: 'No Author Post',
    } as unknown as EntryDataCSL;

    const entry = new EntryCSLAdapter(data);
    expect(entry.authorString).toBeNull();
  });
});
