jest.mock('obsidian', () => ({}), { virtual: true });

import { TemplateSelectionDialog } from '../../src/application/template-selection-dialog';
import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import type { IContentTemplateResolver } from '../../src/application/content-template-resolver';
import type {
  IEditorPosition,
  IEditorProxy,
} from '../../src/platform/platform-adapter';
import type { TemplateContext } from '../../src/core';

const TEMPLATE = ['# {{title}}', '', 'Year: {{year}}'].join('\n');

const NOTE = ['# Main paper', '', 'Year: 2023'];

/** The note text between two positions, as the editor's getSelection returns it. */
function textBetween(
  note: string[],
  from: IEditorPosition,
  to: IEditorPosition,
): string {
  if (from.line === to.line) return note[from.line].slice(from.ch, to.ch);
  return [
    note[from.line].slice(from.ch),
    ...note.slice(from.line + 1, to.line),
    note[to.line].slice(0, to.ch),
  ].join('\n');
}

/** A dialog over `note` with the selection from `from` to `to` (whole line 2 by default). */
function makeDialog(
  note: string[] = NOTE,
  from: IEditorPosition = { line: 2, ch: 0 },
  to: IEditorPosition = { line: 2, ch: note[2]?.length ?? 0 },
) {
  const settings = new CitationsPluginSettings();
  settings.fragmentProfiles = [{ id: 'p1', name: 'year', template: 'Y' }];
  const saveSettings = jest.fn(() => Promise.resolve());
  const editor = {
    replaceSelection: jest.fn(),
    getCursor: jest.fn((which: 'from' | 'to') => (which === 'to' ? to : from)),
    getLine: jest.fn((line: number) => note[line]),
    setSelection: jest.fn(),
  };
  const selection = textBetween(note, from, to);
  const resolver = {
    listTemplateSources: jest.fn(() => ['notes.md']),
    readTemplate: jest.fn(() => Promise.resolve(TEMPLATE)),
  } as unknown as IContentTemplateResolver;
  const dialog = new TemplateSelectionDialog(
    {
      citekey: 'smith2023',
      filePath: 'Reading notes/@smith2023.md',
      text: selection,
    },
    { title: 'Main paper', year: 2024 } as unknown as TemplateContext,
    editor as unknown as IEditorProxy,
    new TemplateService(settings),
    resolver,
    settings,
    saveSettings,
  );
  return { dialog, settings, saveSettings, editor, resolver };
}

describe('TemplateSelectionDialog', () => {
  it('offers the template sources of the settings', () => {
    const { dialog } = makeDialog();
    expect(dialog.templateSources()).toEqual(['notes.md']);
  });

  it('extracts the template line that produced the selection', async () => {
    const { dialog, resolver } = makeDialog();
    await expect(dialog.extract('notes.md')).resolves.toEqual({
      template: 'Year: {{year}}',
      firstLine: 3,
      lastLine: 3,
    });
    expect(resolver.readTemplate).toHaveBeenCalledWith('notes.md');
  });

  it('returns null when the selection is not in the template', async () => {
    const { dialog, editor } = makeDialog(
      ['nothing like this'],
      { line: 0, ch: 8 },
      { line: 0, ch: 12 },
    );
    await expect(dialog.extract('notes.md')).resolves.toBeNull();
    expect(editor.setSelection).not.toHaveBeenCalled();
    expect(dialog.selection.text).toBe('like');
  });

  // Extract returns whole template lines; replacing only part of a note line
  // with them would duplicate the line's literal text ("Year: Year: 2024").
  it('widens a partial selection to whole lines when extract matches', async () => {
    const { dialog, editor } = makeDialog(
      NOTE,
      { line: 2, ch: 6 },
      { line: 2, ch: 10 },
    );
    expect(dialog.selection.text).toBe('2023');
    await expect(dialog.extract('notes.md')).resolves.toMatchObject({
      template: 'Year: {{year}}',
    });
    expect(editor.setSelection).toHaveBeenCalledWith(
      { line: 2, ch: 0 },
      { line: 2, ch: 10 },
    );
    expect(dialog.selection.text).toBe('Year: 2023');
  });

  it('leaves out a line the selection only reaches at its start', async () => {
    const { dialog, editor } = makeDialog(
      [...NOTE, 'Notes'],
      { line: 2, ch: 0 },
      { line: 3, ch: 0 },
    );
    expect(dialog.selection.text).toBe('Year: 2023\n');
    await dialog.extract('notes.md');
    expect(editor.setSelection).toHaveBeenCalledWith(
      { line: 2, ch: 0 },
      { line: 2, ch: 10 },
    );
    expect(dialog.selection.text).toBe('Year: 2023');
  });

  it('inserts with nothing selected and does not extract', async () => {
    const { dialog, resolver } = makeDialog(
      NOTE,
      { line: 1, ch: 0 },
      { line: 1, ch: 0 },
    );
    expect(dialog.inserts).toBe(true);
    await expect(dialog.extract('notes.md')).resolves.toBeNull();
    expect(resolver.readTemplate).not.toHaveBeenCalled();
    expect(dialog.diff('Year: 2024')).toEqual([
      { kind: 'added', lines: ['Year: 2024'] },
    ]);
  });

  it('diffs the selection against the output', () => {
    const { dialog } = makeDialog();
    expect(dialog.inserts).toBe(false);
    expect(dialog.diff('Year: 2024')).toEqual([
      { kind: 'removed', lines: ['Year: 2023'] },
      { kind: 'added', lines: ['Year: 2024'] },
    ]);
  });

  it('renders a template with the entry of the note', () => {
    const { dialog } = makeDialog();
    expect(dialog.render('Year: {{year}}')).toEqual({
      ok: true,
      value: 'Year: 2024',
    });
    expect(dialog.render('{{#each}}').ok).toBe(false);
  });

  it('creates a profile under a new name and saves the settings', async () => {
    const { dialog, settings, saveSettings } = makeDialog();
    const saved = await dialog.saveProfile('', ' pdf ', 'PDF');
    expect(saved).toMatchObject({ name: 'pdf', template: 'PDF' });
    expect(settings.fragmentProfiles.map((p) => p.name)).toEqual([
      'year',
      'pdf',
    ]);
    expect(dialog.profiles()).toBe(settings.fragmentProfiles);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('renames and updates the selected profile', async () => {
    const { dialog, settings } = makeDialog();
    const saved = await dialog.saveProfile('p1', 'year-line', 'Year: {{year}}');
    expect(saved).toEqual({
      id: 'p1',
      name: 'year-line',
      template: 'Year: {{year}}',
    });
    expect(settings.fragmentProfiles).toEqual([saved]);
  });

  it('refuses a name another profile uses', async () => {
    const { dialog, saveSettings } = makeDialog();
    expect(dialog.nameRejection('', 'year')).toBe(
      'Another profile already uses this name.',
    );
    await expect(dialog.saveProfile('', 'year', 'T')).rejects.toThrow(
      'Another profile already uses this name.',
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('replaces the selection in the editor', () => {
    const { dialog, editor } = makeDialog();
    dialog.apply('Year: 2024');
    expect(editor.replaceSelection).toHaveBeenCalledWith('Year: 2024');
  });
});

describe('TemplateSelectionDialog output', () => {
  /** A block unit: renders with the line break of its last line. */
  const BLOCK = ['{{#if year}}', 'Year: {{year}}', '{{/if}}'].join('\n');

  // Whole note lines are selected without the final line break, so a block's
  // trailing one would leave an empty line behind on every apply.
  it('drops the final line break of a block when the selection has none', () => {
    const { dialog } = makeDialog();
    const output = dialog.output(BLOCK);
    expect(output).toEqual({ ok: true, value: 'Year: 2024' });
    const added = dialog
      .diff(output.ok ? output.value : '')
      .filter((hunk) => hunk.kind === 'added')
      .flatMap((hunk) => hunk.lines);
    expect(added).toEqual(['Year: 2024']);
  });

  it('keeps the final line break when the selection ends with one', () => {
    const { dialog } = makeDialog(
      ['# Main paper', '', 'Year: 2023', ''],
      { line: 2, ch: 0 },
      { line: 3, ch: 0 },
    );
    expect(dialog.selection.text).toBe('Year: 2023\n');
    expect(dialog.output(BLOCK)).toEqual({ ok: true, value: 'Year: 2024\n' });
  });

  it('keeps the final line break when inserting at the cursor', () => {
    const { dialog } = makeDialog(NOTE, { line: 1, ch: 0 }, { line: 1, ch: 0 });
    expect(dialog.inserts).toBe(true);
    expect(dialog.output(BLOCK)).toEqual({ ok: true, value: 'Year: 2024\n' });
  });

  it('passes a render error through', () => {
    const { dialog } = makeDialog();
    expect(dialog.output('{{#each}}').ok).toBe(false);
  });
});
