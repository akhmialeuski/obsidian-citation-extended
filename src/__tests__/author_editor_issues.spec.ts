import { EntryCSLAdapter, EntryBibLaTeXAdapter, EntryDataCSL } from '../types';
import { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';

describe('Author/Editor Display Issues', () => {
  describe('CSL-JSON Adapter', () => {
    it('should handle authors with "literal" field (single name/organization)', () => {
      const data = {
        id: 'literal-author',
        type: 'book',
        author: [{ literal: 'Organization Name' }],
        title: 'Test Title',
      } as unknown as EntryDataCSL;

      const entry = new EntryCSLAdapter(data);
      expect(entry.authorString).toBe('Organization Name');
    });

    it('should fallback to editors if author is missing', () => {
      const data = {
        id: 'editor-only',
        type: 'book',
        editor: [{ given: 'John', family: 'Doe' }],
        title: 'Edited Book',
      } as unknown as EntryDataCSL;

      const entry = new EntryCSLAdapter(data);
      expect(entry.authorString).toBe('John Doe (Eds.)');
    });

    it('should handle editors with "literal" field', () => {
      const data = {
        id: 'editor-literal',
        type: 'book',
        editor: [{ literal: 'Organization Editor' }],
        title: 'Edited Book',
      } as unknown as EntryDataCSL;

      const entry = new EntryCSLAdapter(data);
      expect(entry.authorString).toBe('Organization Editor (Eds.)');
    });
  });

  describe('BibLaTeX Adapter', () => {
    it('should fallback to editors if author is missing', () => {
      const data = {
        key: 'editor-only',
        type: 'book',
        creators: {
          editor: [{ firstName: 'John', lastName: 'Doe' }],
        },
        fields: {
          title: 'Edited Book',
        },
      } as unknown as EntryDataBibLaTeX;

      const entry = new EntryBibLaTeXAdapter(data);
      expect(entry.authorString).toBe('John Doe (Eds.)');
    });
  });
});
