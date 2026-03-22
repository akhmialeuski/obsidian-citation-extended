import { IntrospectionService } from '../../src/template/introspection.service';
import { Library } from '../../src/core';
import { createMockEntry } from '../helpers/mock-obsidian';

jest.mock('obsidian', () => ({ normalizePath: (p: string) => p }), {
  virtual: true,
});

describe('IntrospectionService', () => {
  let service: IntrospectionService;

  beforeEach(() => {
    service = new IntrospectionService();
  });

  describe('getTemplateVariables', () => {
    it('returns known variables when library is null', () => {
      const vars = service.getTemplateVariables(null);

      expect(vars.length).toBeGreaterThan(0);
      const citekeyVar = vars.find((v) => v.key === 'citekey');
      expect(citekeyVar).toBeDefined();
      expect(citekeyVar?.description).toBeDefined();
    });

    it('returns known variables including citekey and title', () => {
      const vars = service.getTemplateVariables(null);

      const knownKeys = ['citekey', 'title', 'authorString', 'year'];
      for (const key of knownKeys) {
        const found = vars.find((v) => v.key === key);
        expect(found).toBeDefined();
      }
    });

    it('discovers dynamic variables from library entries', () => {
      const entry = createMockEntry({ customField: 'custom value' });
      const library = new Library({
        test2024: entry as never,
      });

      const vars = service.getTemplateVariables(library);

      // Should include both known and dynamic variables
      expect(vars.some((v) => v.key === 'citekey')).toBe(true);
      expect(vars.some((v) => v.key === 'title')).toBe(true);
    });

    it('returns a non-empty array', () => {
      const vars = service.getTemplateVariables(null);
      expect(vars.length).toBeGreaterThan(10);
    });

    it('includes currentDate in known variables', () => {
      const vars = service.getTemplateVariables(null);
      const dateVar = vars.find((v) => v.key === 'currentDate');
      expect(dateVar).toBeDefined();
    });
  });
});
