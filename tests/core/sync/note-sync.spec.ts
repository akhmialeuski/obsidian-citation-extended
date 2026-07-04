import { buildSyncBlock, planNoteSync } from '../../../src/core/sync';
import type { NoteBaseline } from '../../../src/core/sync';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Template render with the given year and annotation text. */
function render(year: number, annotation = 'first highlight'): string {
  return [
    '---',
    'title: "A Study"',
    `year: ${year}`,
    '---',
    '',
    buildSyncBlock('meta', `**Year:** ${year}`, { title: 'Metadata' }),
    '',
    '## My notes',
    '',
    buildSyncBlock('annots', annotation, { title: 'Annotations' }),
    '',
  ].join('\n');
}

/** Baseline equivalent to `render(year, annotation)`. */
function baselineFor(
  year: number,
  annotation = 'first highlight',
): NoteBaseline {
  return {
    frontmatter: {
      title: 'title: "A Study"',
      year: `year: ${year}`,
    },
    blocks: {
      meta: buildSyncBlock('meta', `**Year:** ${year}`, { title: 'Metadata' }),
      annots: buildSyncBlock('annots', annotation, { title: 'Annotations' }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('planNoteSync', () => {
  it('reports no change when note matches the render', () => {
    const content = render(2023);
    const plan = planNoteSync({
      rendered: content,
      current: content,
      baseline: baselineFor(2023),
    });

    expect(plan.changed).toBe(false);
    expect(plan.conflicts).toEqual([]);
    expect(plan.content).toBe(content);
  });

  it('never touches user content outside plugin blocks', () => {
    const current = render(2023).replace(
      '## My notes\n',
      '## My notes\n\nMy own thoughts on the paper.\n',
    );
    const plan = planNoteSync({
      rendered: render(2024),
      current,
      baseline: baselineFor(2023),
    });

    expect(plan.conflicts).toEqual([]);
    expect(plan.content).toContain('My own thoughts on the paper.');
    expect(plan.content).toContain('**Year:** 2024');
    expect(plan.content).toContain('year: 2024');
  });

  describe('blocks', () => {
    it('replaces a pristine block when the library changed', () => {
      const plan = planNoteSync({
        rendered: render(2024),
        current: render(2023),
        baseline: baselineFor(2023),
      });

      expect(plan.changed).toBe(true);
      expect(plan.conflicts).toEqual([]);
      expect(plan.summary.blocksReplaced).toContain('meta');
      expect(plan.content).toContain('**Year:** 2024');
    });

    it('keeps a user-edited block when the library is unchanged', () => {
      const current = render(2023).replace(
        'first highlight',
        'first highlight — my comment',
      );
      const plan = planNoteSync({
        rendered: render(2023),
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.conflicts).toEqual([]);
      expect(plan.content).toContain('first highlight — my comment');
    });

    it('merges non-overlapping user and library edits inside a block', () => {
      const base = 'quote A\nfiller one\nfiller two\nquote B';
      // Library rewrites the LAST line; the user edited the FIRST line.
      const rendered = render(
        2023,
        'quote A\nfiller one\nfiller two\nquote B (revised)',
      );
      const current = render(2023, base).replace(
        '> quote A',
        '> quote A — my comment',
      );

      const plan = planNoteSync({
        rendered,
        current,
        baseline: baselineFor(2023, base),
      });

      expect(plan.conflicts).toEqual([]);
      expect(plan.summary.blocksMerged).toContain('annots');
      expect(plan.content).toContain('quote A — my comment');
      expect(plan.content).toContain('quote B (revised)');
    });

    it('conflicts when both sides changed the same line', () => {
      const rendered = render(2023, 'REWRITTEN BY LIBRARY');
      const current = render(2023).replace(
        'first highlight',
        'rewritten by me',
      );

      const plan = planNoteSync({
        rendered,
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0]).toMatchObject({ kind: 'block', id: 'annots' });
      // Safe default keeps the user's version…
      expect(plan.content).toContain('rewritten by me');
      // …while the alternative takes the library's.
      expect(plan.contentTakeTheirs).toContain('REWRITTEN BY LIBRARY');
    });

    it('appends a brand-new block at the end of the body', () => {
      const rendered =
        render(2023) + buildSyncBlock('pdfs', '[paper](file://x.pdf)');
      const plan = planNoteSync({
        rendered,
        current: render(2023),
        baseline: baselineFor(2023),
      });

      expect(plan.summary.blocksAppended).toContain('pdfs');
      const body = plan.content;
      expect(body.indexOf('^zc-pdfs')).toBeGreaterThan(
        body.indexOf('^zc-annots'),
      );
    });

    it('respects a user deletion instead of re-appending the block', () => {
      // The user deleted the annots block entirely.
      const current = render(2023)
        .replace(
          buildSyncBlock('annots', 'first highlight', { title: 'Annotations' }),
          '',
        )
        .replace(/\n{3,}/g, '\n\n');

      const plan = planNoteSync({
        rendered: render(2023),
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.summary.blocksDeletedByUser).toContain('annots');
      expect(plan.content).not.toContain('^zc-annots');
      expect(plan.baseline.deletedBlocks).toContain('annots');
    });

    it('keeps honouring the deletion via the tombstone on later syncs', () => {
      const current = render(2023)
        .replace(
          buildSyncBlock('annots', 'first highlight', { title: 'Annotations' }),
          '',
        )
        .replace(/\n{3,}/g, '\n\n');
      const baseline: NoteBaseline = {
        ...baselineFor(2023),
        blocks: { meta: baselineFor(2023).blocks.meta },
        deletedBlocks: ['annots'],
      };

      const plan = planNoteSync({
        rendered: render(2024),
        current,
        baseline,
      });

      expect(plan.content).not.toContain('^zc-annots');
      expect(plan.baseline.deletedBlocks).toContain('annots');
    });

    it('removes a pristine block that the render dropped', () => {
      const rendered = render(2023).replace(
        buildSyncBlock('annots', 'first highlight', { title: 'Annotations' }),
        '',
      );
      const plan = planNoteSync({
        rendered,
        current: render(2023),
        baseline: baselineFor(2023),
      });

      expect(plan.summary.blocksRemoved).toContain('annots');
      expect(plan.content).not.toContain('^zc-annots');
    });

    it('conflicts when the render dropped a block the user edited', () => {
      const rendered = render(2023).replace(
        buildSyncBlock('annots', 'first highlight', { title: 'Annotations' }),
        '',
      );
      const current = render(2023).replace('first highlight', 'edited by user');

      const plan = planNoteSync({
        rendered,
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.conflicts).toHaveLength(1);
      expect(plan.content).toContain('edited by user');
      expect(plan.contentTakeTheirs).not.toContain('^zc-annots');
    });

    it('leaves unknown zc-style blocks strictly alone', () => {
      const foreign = buildSyncBlock('from-another-tool', 'their content');
      const current = `${render(2023)}\n${foreign}\n`;

      const plan = planNoteSync({
        rendered: render(2023),
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.content).toContain('their content');
      expect(plan.conflicts).toEqual([]);
    });

    it('flags a differing block as a conflict on first sync (no baseline)', () => {
      const current = render(2023).replace(
        'first highlight',
        'possibly edited by the user',
      );
      const plan = planNoteSync({
        rendered: render(2023),
        current,
        baseline: null,
      });

      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].base).toBeNull();
      expect(plan.content).toContain('possibly edited by the user');
      expect(plan.contentTakeTheirs).toContain('first highlight');
    });
  });

  describe('frontmatter', () => {
    it('refreshes plugin keys and keeps user keys', () => {
      const current = render(2023).replace(
        'year: 2023',
        'year: 2023\nrating: 5',
      );
      const plan = planNoteSync({
        rendered: render(2024),
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.conflicts).toEqual([]);
      expect(plan.content).toContain('year: 2024');
      expect(plan.content).toContain('rating: 5');
      expect(plan.summary.frontmatterKeysUpdated).toContain('year');
    });

    it('keeps a user-edited value when the library did not change it', () => {
      const current = render(2023).replace(
        'title: "A Study"',
        'title: "A Study (my shorter title)"',
      );
      const plan = planNoteSync({
        rendered: render(2023),
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.conflicts).toEqual([]);
      expect(plan.content).toContain('my shorter title');
    });

    it('conflicts when both sides changed the same key', () => {
      const rendered = render(2023).replace(
        'title: "A Study"',
        'title: "A Study — Second Edition"',
      );
      const current = render(2023).replace(
        'title: "A Study"',
        'title: "my own title"',
      );

      const plan = planNoteSync({
        rendered,
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0]).toMatchObject({
        kind: 'frontmatter',
        id: 'title',
      });
      expect(plan.content).toContain('my own title');
      expect(plan.contentTakeTheirs).toContain('Second Edition');
    });

    it('honours a user-deleted key when the data is unchanged', () => {
      const current = render(2023).replace('title: "A Study"\n', '');
      const plan = planNoteSync({
        rendered: render(2023),
        current,
        baseline: baselineFor(2023),
      });

      expect(plan.content).not.toContain('title:');
    });
  });

  describe('frontmatterOnly mode', () => {
    it('updates frontmatter but leaves body blocks untouched', () => {
      const plan = planNoteSync({
        rendered: render(2024, 'NEW ANNOTATION'),
        current: render(2023),
        baseline: baselineFor(2023),
        frontmatterOnly: true,
      });

      expect(plan.content).toContain('year: 2024');
      expect(plan.content).toContain('first highlight');
      expect(plan.content).not.toContain('NEW ANNOTATION');
    });

    it('carries the block baseline forward unchanged', () => {
      const baseline = baselineFor(2023);
      const plan = planNoteSync({
        rendered: render(2024),
        current: render(2023),
        baseline,
        frontmatterOnly: true,
      });

      expect(plan.baseline.blocks).toEqual(baseline.blocks);
    });
  });

  it('is idempotent: applying a plan and re-planning yields no change', () => {
    const current = render(2023).replace(
      '## My notes\n',
      '## My notes\n\nkeep me\n',
    );
    const first = planNoteSync({
      rendered: render(2024),
      current,
      baseline: baselineFor(2023),
    });

    const second = planNoteSync({
      rendered: render(2024),
      current: first.content,
      baseline: first.baseline,
    });

    expect(second.changed).toBe(false);
    expect(second.conflicts).toEqual([]);
  });
});
