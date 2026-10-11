jest.mock('obsidian', () => ({}), { virtual: true });

import { TemplateSelectionDialog } from '../../src/application/template-selection-dialog';
import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import type { IContentTemplateResolver } from '../../src/application/content-template-resolver';
import type { IEditorProxy } from '../../src/platform/platform-adapter';
import type { TemplateContext } from '../../src/core';

const TEMPLATE = ['# {{title}}', '', 'Year: {{year}}'].join('\n');

function makeDialog(selection = 'Year: 2023') {
  const settings = new CitationsPluginSettings();
  settings.fragmentProfiles = [{ id: 'p1', name: 'year', template: 'Y' }];
  const saveSettings = jest.fn(() => Promise.resolve());
  const editor = { replaceSelection: jest.fn() } as unknown as IEditorProxy;
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
    editor,
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
    const { dialog } = makeDialog('nothing like this');
    await expect(dialog.extract('notes.md')).resolves.toBeNull();
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
