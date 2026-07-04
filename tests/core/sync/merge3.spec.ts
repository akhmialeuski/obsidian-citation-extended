import { lineDiff, mergeText } from '../../../src/core/sync';

describe('mergeText', () => {
  const BASE = ['line 1', 'line 2', 'line 3', 'line 4'].join('\n');

  it('returns the base when nothing changed', () => {
    const result = mergeText(BASE, BASE, BASE);
    expect(result.ok).toBe(true);
    expect(result.merged).toBe(BASE);
  });

  it('takes their change when ours is untouched', () => {
    const theirs = BASE.replace('line 2', 'line 2 (updated)');
    const result = mergeText(BASE, BASE, theirs);
    expect(result.ok).toBe(true);
    expect(result.merged).toBe(theirs);
  });

  it('keeps our change when theirs is untouched', () => {
    const ours = BASE.replace('line 3', 'line 3 (mine)');
    const result = mergeText(BASE, ours, BASE);
    expect(result.ok).toBe(true);
    expect(result.merged).toBe(ours);
  });

  it('combines non-overlapping edits from both sides', () => {
    const ours = BASE.replace('line 1', 'line 1 (mine)');
    const theirs = BASE.replace('line 4', 'line 4 (theirs)');

    const result = mergeText(BASE, ours, theirs);

    expect(result.ok).toBe(true);
    expect(result.merged).toContain('line 1 (mine)');
    expect(result.merged).toContain('line 4 (theirs)');
  });

  it('merges an addition from theirs with an edit from ours', () => {
    const ours = BASE.replace('line 1', 'line 1 (mine)');
    const theirs = `${BASE}\nline 5 (new)`;

    const result = mergeText(BASE, ours, theirs);

    expect(result.ok).toBe(true);
    expect(result.merged).toContain('line 1 (mine)');
    expect(result.merged).toContain('line 5 (new)');
  });

  it('reports a conflict on overlapping edits and keeps ours', () => {
    const ours = BASE.replace('line 2', 'line 2 (mine)');
    const theirs = BASE.replace('line 2', 'line 2 (theirs)');

    const result = mergeText(BASE, ours, theirs);

    expect(result.ok).toBe(false);
    expect(result.merged).toContain('line 2 (mine)');
    expect(result.merged).not.toContain('line 2 (theirs)');
  });

  it('treats identical edits on both sides as clean', () => {
    const same = BASE.replace('line 2', 'line 2 (both)');
    const result = mergeText(BASE, same, same);
    expect(result.ok).toBe(true);
    expect(result.merged).toBe(same);
  });
});

describe('lineDiff', () => {
  it('reports identical text as one same-hunk', () => {
    const hunks = lineDiff('a\nb', 'a\nb');
    expect(hunks).toEqual([{ kind: 'same', lines: ['a', 'b'] }]);
  });

  it('expands changes into removed and added hunks', () => {
    const hunks = lineDiff('a\nold\nc', 'a\nnew\nc');

    expect(hunks).toEqual([
      { kind: 'same', lines: ['a'] },
      { kind: 'removed', lines: ['old'] },
      { kind: 'added', lines: ['new'] },
      { kind: 'same', lines: ['c'] },
    ]);
  });

  it('handles pure insertions and deletions', () => {
    expect(lineDiff('a', 'a\nb')).toEqual([
      { kind: 'same', lines: ['a'] },
      { kind: 'added', lines: ['b'] },
    ]);
    expect(lineDiff('a\nb', 'b')).toEqual([
      { kind: 'removed', lines: ['a'] },
      { kind: 'same', lines: ['b'] },
    ]);
  });
});
