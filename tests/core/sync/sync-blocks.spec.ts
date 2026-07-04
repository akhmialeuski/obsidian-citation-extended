import {
  buildSyncBlock,
  hasSyncBlocks,
  isValidSyncBlockName,
  parseSyncBlocks,
} from '../../../src/core/sync';

describe('isValidSyncBlockName', () => {
  it.each(['meta', 'my-block', 'my_block', 'Annot2'])('accepts %s', (name) => {
    expect(isValidSyncBlockName(name)).toBe(true);
  });

  it.each(['', 'has space', 'no%signs', 42, null, undefined])(
    'rejects %p',
    (name) => {
      expect(isValidSyncBlockName(name)).toBe(false);
    },
  );
});

describe('buildSyncBlock', () => {
  it('builds a callout with the plugin block ID', () => {
    expect(buildSyncBlock('meta', 'line one\nline two')).toBe(
      ['> [!note] meta', '> line one', '> line two', '> ^zc-meta'].join('\n'),
    );
  });

  it('honours type, title, and collapsed options', () => {
    expect(
      buildSyncBlock('annots', 'text', {
        type: 'quote',
        title: 'Annotations',
        collapsed: true,
      }),
    ).toBe(['> [!quote]- Annotations', '> text', '> ^zc-annots'].join('\n'));
  });

  it('renders an empty block as header + ID only', () => {
    expect(buildSyncBlock('empty', '\n\n')).toBe(
      ['> [!note] empty', '> ^zc-empty'].join('\n'),
    );
  });

  it('quotes blank inner lines without trailing spaces', () => {
    expect(buildSyncBlock('m', 'a\n\nb')).toBe(
      ['> [!note] m', '> a', '>', '> b', '> ^zc-m'].join('\n'),
    );
  });
});

describe('parseSyncBlocks', () => {
  const NOTE = [
    '# My reading note',
    '',
    '> [!note] Metadata',
    '> **Year:** 2023',
    '> ^zc-meta',
    '',
    'user text between blocks',
    '',
    '> [!quote]- Annotations',
    '> a highlight',
    '> ^zc-annots',
    '',
    'trailing user text',
  ].join('\n');

  it('finds every plugin block with its span', () => {
    const blocks = parseSyncBlocks(NOTE);

    expect([...blocks.keys()]).toEqual(['meta', 'annots']);
    const meta = blocks.get('meta')!;
    expect(meta.startLine).toBe(2);
    expect(meta.endLine).toBe(4);
    expect(meta.text).toBe(
      ['> [!note] Metadata', '> **Year:** 2023', '> ^zc-meta'].join('\n'),
    );
  });

  it('round-trips blocks built by buildSyncBlock', () => {
    const text = buildSyncBlock('x', 'inner', { type: 'cite' });
    const blocks = parseSyncBlocks(`intro\n${text}\noutro`);
    expect(blocks.get('x')!.text).toBe(text);
  });

  it('ignores callouts without a plugin ID', () => {
    const content = ['> [!warning] user callout', '> their text'].join('\n');
    expect(parseSyncBlocks(content).size).toBe(0);
    expect(hasSyncBlocks(content)).toBe(false);
  });

  it('ignores non-plugin block IDs', () => {
    const content = ['> [!note] x', '> body', '> ^my-own-id'].join('\n');
    expect(parseSyncBlocks(content).size).toBe(0);
  });

  it('keeps the first block when names are duplicated', () => {
    const content = ['> first', '> ^zc-dup', '', '> second', '> ^zc-dup'].join(
      '\n',
    );
    const blocks = parseSyncBlocks(content);
    expect(blocks.size).toBe(1);
    expect(blocks.get('dup')!.text).toContain('first');
  });

  it('tolerates CRLF line endings on the ID line', () => {
    const content = '> [!note] m\r\n> body\r\n> ^zc-m\r\n';
    expect(hasSyncBlocks(content)).toBe(true);
    expect(parseSyncBlocks(content).get('m')).toBeDefined();
  });

  it('does not treat an inline ^zc mention as a block', () => {
    expect(hasSyncBlocks('text about ^zc-meta ids')).toBe(false);
  });

  // --- walk-back precision (regression) ------------------------------------

  it('does not absorb a user callout stacked directly above the block', () => {
    // No blank line between the user callout and the plugin block: the plugin
    // block must still start at its OWN header, leaving the user callout whole.
    const content = [
      '> [!warning] user callout',
      '> hand-written line',
      '> [!note] Metadata',
      '> **Year:** 2023',
      '> ^zc-meta',
    ].join('\n');

    const blocks = parseSyncBlocks(content);
    const meta = blocks.get('meta')!;

    expect(meta.startLine).toBe(2); // the "> [!note] Metadata" header, not line 0
    expect(meta.text).toBe(
      ['> [!note] Metadata', '> **Year:** 2023', '> ^zc-meta'].join('\n'),
    );
    expect(meta.text).not.toContain('user callout');
    expect(meta.text).not.toContain('hand-written line');
  });

  it('keeps two adjacent plugin blocks separate (no blank line between)', () => {
    const content = [
      '> [!note] A',
      '> alpha',
      '> ^zc-a',
      '> [!note] B',
      '> beta',
      '> ^zc-b',
    ].join('\n');

    const blocks = parseSyncBlocks(content);

    expect([...blocks.keys()]).toEqual(['a', 'b']);
    expect(blocks.get('a')!.text).toBe(
      ['> [!note] A', '> alpha', '> ^zc-a'].join('\n'),
    );
    expect(blocks.get('b')!.text).toBe(
      ['> [!note] B', '> beta', '> ^zc-b'].join('\n'),
    );
  });
});
