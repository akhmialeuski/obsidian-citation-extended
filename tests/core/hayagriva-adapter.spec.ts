import {
  HayagrivaAdapter,
  parseHayagrivaYaml,
} from '../../src/core/adapters/hayagriva-adapter';

describe('HayagrivaAdapter', () => {
  it('should create an entry with basic fields', () => {
    const adapter = new HayagrivaAdapter('smith2023', {
      type: 'article',
      title: 'A Test Paper',
      date: '2023-06-15',
      url: 'https://example.com',
      doi: '10.1234/test',
    });

    expect(adapter.id).toBe('smith2023');
    expect(adapter.citekey).toBe('smith2023');
    expect(adapter.type).toBe('article');
    expect(adapter.title).toBe('A Test Paper');
    expect(adapter.URL).toBe('https://example.com');
    expect(adapter.DOI).toBe('10.1234/test');
  });

  it('should parse string authors', () => {
    const adapter = new HayagrivaAdapter('test', {
      author: ['John Doe', 'Jane Smith'],
    });

    expect(adapter.author).toEqual([
      { given: 'John', family: 'Doe' },
      { given: 'Jane', family: 'Smith' },
    ]);
    expect(adapter.authorString).toBe('John Doe, Jane Smith');
  });

  it('should parse structured authors', () => {
    const adapter = new HayagrivaAdapter('test', {
      author: [{ given: 'Albert', family: 'Einstein' }],
    });

    expect(adapter.author).toEqual([{ given: 'Albert', family: 'Einstein' }]);
  });

  it('should handle single-name authors as literal', () => {
    const adapter = new HayagrivaAdapter('test', {
      author: ['UNESCO'],
    });

    expect(adapter.author).toEqual([{ literal: 'UNESCO' }]);
  });

  it('should parse date with year only', () => {
    const adapter = new HayagrivaAdapter('test', { date: '2023' });
    expect(adapter.issuedDate).toEqual(new Date(Date.UTC(2023, 0, 1)));
    expect(adapter.year).toBe(2023);
  });

  it('should parse date with year and month', () => {
    const adapter = new HayagrivaAdapter('test', { date: '2023-06' });
    expect(adapter.issuedDate).toEqual(new Date(Date.UTC(2023, 5, 1)));
  });

  it('should parse full date', () => {
    const adapter = new HayagrivaAdapter('test', { date: '2023-06-15' });
    expect(adapter.issuedDate).toEqual(new Date(Date.UTC(2023, 5, 15)));
  });

  it('should return null for missing date', () => {
    const adapter = new HayagrivaAdapter('test', {});
    expect(adapter.issuedDate).toBeNull();
  });

  it('should get container title from parent', () => {
    const adapter = new HayagrivaAdapter('test', {
      parent: { title: 'Nature' },
    });
    expect(adapter.containerTitle).toBe('Nature');
  });

  it('should get publisher from parent if not set directly', () => {
    const adapter = new HayagrivaAdapter('test', {
      parent: { publisher: 'Springer' },
    });
    expect(adapter.publisher).toBe('Springer');
  });

  it('should generate zoteroSelectURI', () => {
    const adapter = new HayagrivaAdapter('smith2023', {});
    expect(adapter.zoteroSelectURI).toBe('zotero://select/items/@smith2023');
  });

  it('should support toJSON', () => {
    const adapter = new HayagrivaAdapter('test', {
      title: 'Hello',
      date: '2023',
    });
    const json = adapter.toJSON();
    expect(json.title).toBe('Hello');
    expect(json.citekey).toBe('test');
  });
});

describe('parseHayagrivaYaml', () => {
  it('should parse basic Hayagriva YAML', () => {
    const yaml = `smith2023:
  type: article
  title: A Test Paper
  date: 2023-06-15

jones2022:
  type: book
  title: Another Work
  date: 2022
`;

    const entries = parseHayagrivaYaml(yaml);
    expect(entries).toHaveLength(2);
    expect(entries[0].citekey).toBe('smith2023');
    expect(entries[0].data.title).toBe('A Test Paper');
    expect(entries[0].data.type).toBe('article');
    expect(entries[1].citekey).toBe('jones2022');
    expect(entries[1].data.type).toBe('book');
  });

  it('should parse authors as list', () => {
    const yaml = `entry1:
  title: Test
  author:
    - John Doe
    - Jane Smith
`;

    const entries = parseHayagrivaYaml(yaml);
    expect(entries[0].data.author).toEqual(['John Doe', 'Jane Smith']);
  });

  it('should handle empty YAML', () => {
    const entries = parseHayagrivaYaml('');
    expect(entries).toHaveLength(0);
  });

  it('should handle YAML with comments', () => {
    const yaml = `# A bibliography file
entry1:
  # This is a comment
  title: Test
`;

    const entries = parseHayagrivaYaml(yaml);
    expect(entries).toHaveLength(1);
    expect(entries[0].data.title).toBe('Test');
  });
});
