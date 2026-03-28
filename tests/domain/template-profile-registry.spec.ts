import {
  TemplateProfileRegistry,
} from '../../src/domain/template-profile-registry';
import {
  TemplateProfile,
  DEFAULT_PROFILE,
  DEFAULT_NOTE_KIND,
} from '../../src/domain/template-profile';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeProfile(overrides: Partial<TemplateProfile> = {}): TemplateProfile {
  return {
    id: 'test',
    noteKind: 'literature-note',
    entryTypes: ['*'],
    titleTemplate: '@{{citekey}}',
    contentTemplatePath: 'test-template.md',
    ...overrides,
  };
}

describe('TemplateProfileRegistry', () => {
  let registry: TemplateProfileRegistry;

  beforeEach(() => {
    registry = new TemplateProfileRegistry();
  });

  describe('resolve', () => {
    it('returns default profile when no profiles registered', () => {
      const result = registry.resolve('literature-note', 'article');
      expect(result).toEqual(DEFAULT_PROFILE);
    });

    it('matches exact noteKind + entryType', () => {
      const articleProfile = makeProfile({
        id: 'article',
        noteKind: 'literature-note',
        entryTypes: ['article'],
        contentTemplatePath: 'article-template.md',
      });
      registry.register(articleProfile);

      const result = registry.resolve('literature-note', 'article');
      expect(result).toBe(articleProfile);
    });

    it('matches wildcard entryType when no exact match', () => {
      const wildcardProfile = makeProfile({
        id: 'wildcard',
        noteKind: 'literature-note',
        entryTypes: ['*'],
        contentTemplatePath: 'all-template.md',
      });
      registry.register(wildcardProfile);

      const result = registry.resolve('literature-note', 'thesis');
      expect(result).toBe(wildcardProfile);
    });

    it('prefers exact match over wildcard', () => {
      const wildcardProfile = makeProfile({
        id: 'wildcard',
        entryTypes: ['*'],
        contentTemplatePath: 'all.md',
      });
      const articleProfile = makeProfile({
        id: 'article',
        entryTypes: ['article'],
        contentTemplatePath: 'article.md',
      });
      registry.register(wildcardProfile);
      registry.register(articleProfile);

      const result = registry.resolve('literature-note', 'article');
      expect(result).toBe(articleProfile);
    });

    it('falls back to default when noteKind does not match', () => {
      const profile = makeProfile({
        id: 'reading',
        noteKind: 'reading-note',
        entryTypes: ['*'],
      });
      registry.register(profile);

      const result = registry.resolve('literature-note', 'article');
      expect(result).toEqual(DEFAULT_PROFILE);
    });

    it('supports multiple entry types in one profile', () => {
      const profile = makeProfile({
        id: 'multi',
        entryTypes: ['article', 'book', 'thesis'],
      });
      registry.register(profile);

      expect(registry.resolve('literature-note', 'article')).toBe(profile);
      expect(registry.resolve('literature-note', 'book')).toBe(profile);
      expect(registry.resolve('literature-note', 'thesis')).toBe(profile);
      expect(registry.resolve('literature-note', 'conference')).toEqual(
        DEFAULT_PROFILE,
      );
    });
  });

  describe('register', () => {
    it('replaces existing profile with same id', () => {
      const v1 = makeProfile({ id: 'test', contentTemplatePath: 'v1.md' });
      const v2 = makeProfile({ id: 'test', contentTemplatePath: 'v2.md' });
      registry.register(v1);
      registry.register(v2);

      expect(registry.getProfiles()).toHaveLength(1);
      expect(registry.getProfiles()[0].contentTemplatePath).toBe('v2.md');
    });
  });

  describe('registerNoteKind', () => {
    it('starts with default note kind', () => {
      expect(registry.getNoteKinds()).toHaveLength(1);
      expect(registry.getNoteKinds()[0]).toEqual(DEFAULT_NOTE_KIND);
    });

    it('adds new note kind', () => {
      registry.registerNoteKind({
        id: 'reading-note',
        name: 'Reading Note',
        folder: 'Reading',
      });

      expect(registry.getNoteKinds()).toHaveLength(2);
    });

    it('does not duplicate existing note kind', () => {
      registry.registerNoteKind(DEFAULT_NOTE_KIND);
      expect(registry.getNoteKinds()).toHaveLength(1);
    });
  });

  describe('getters', () => {
    it('getProfiles returns a copy', () => {
      registry.register(makeProfile());
      const profiles = registry.getProfiles();
      profiles.pop();
      expect(registry.getProfiles()).toHaveLength(1);
    });

    it('getDefaultProfile returns the default', () => {
      expect(registry.getDefaultProfile()).toEqual(DEFAULT_PROFILE);
    });

    it('accepts custom default profile', () => {
      const custom = makeProfile({ id: 'custom-default' });
      const reg = new TemplateProfileRegistry(custom);
      expect(reg.getDefaultProfile()).toBe(custom);
    });
  });
});
