/** @jest-environment jsdom */
import type { TemplateSelectionDialog } from '../../../src/application/template-selection-dialog';
import type { FragmentProfile } from '../../../src/domain/fragment-profile';
import type { TemplateFragmentMatch } from '../../../src/template/template-fragment-locator';
import { lineDiff } from '../../../src/core';

const notices: string[] = [];

// Minimal Obsidian stand-ins backed by jsdom. The element helpers
// (createEl/createDiv/createSpan/empty/addClass/setText) are attached the way
// Obsidian attaches them to HTMLElement.
jest.mock(
  'obsidian',
  () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.createEl = function (
      this: HTMLElement,
      tag: string,
      opts?: { cls?: string; text?: string; attr?: Record<string, string> },
    ) {
      const child = document.createElement(tag);
      if (opts?.cls) child.className = opts.cls;
      if (opts?.text) child.textContent = opts.text;
      for (const [k, v] of Object.entries(opts?.attr ?? {})) {
        child.setAttribute(k, v);
      }
      this.appendChild(child);
      return child;
    };
    proto.createDiv = function (
      this: HTMLElement & { createEl: (t: string, o?: unknown) => HTMLElement },
      opts?: string | { cls?: string; text?: string },
    ) {
      return this.createEl(
        'div',
        typeof opts === 'string' ? { cls: opts } : opts,
      );
    };
    proto.createSpan = function (
      this: HTMLElement & { createEl: (t: string, o?: unknown) => HTMLElement },
      opts?: { cls?: string; text?: string; attr?: Record<string, string> },
    ) {
      return this.createEl('span', opts);
    };
    proto.empty = function (this: HTMLElement) {
      this.innerHTML = '';
    };
    proto.addClass = function (this: HTMLElement, cls: string) {
      this.classList.add(cls);
    };
    proto.setText = function (this: HTMLElement, text: string) {
      this.textContent = text;
    };

    class ButtonComponent {
      buttonEl = document.createElement('button');
      setButtonText(text: string) {
        this.buttonEl.textContent = text;
        return this;
      }
      setCta() {
        this.buttonEl.classList.add('mod-cta');
        return this;
      }
      setDisabled(disabled: boolean) {
        this.buttonEl.disabled = disabled;
        return this;
      }
      onClick(fn: () => void) {
        this.buttonEl.addEventListener('click', fn);
        return this;
      }
    }

    class Setting {
      settingEl = document.createElement('div');
      descEl = document.createElement('div');
      controlEl = document.createElement('div');
      constructor(container: HTMLElement) {
        this.settingEl.className = 'setting-item';
        this.settingEl.append(this.descEl, this.controlEl);
        container.appendChild(this.settingEl);
      }
      setName(name: string) {
        this.settingEl.dataset.name = name;
        return this;
      }
      setDesc(desc: string) {
        this.descEl.textContent = desc;
        return this;
      }
      addDropdown(
        cb: (d: {
          addOption: (v: string, l: string) => unknown;
          setValue: (v: string) => unknown;
          onChange: (fn: (v: string) => void) => unknown;
        }) => void,
      ) {
        const select = document.createElement('select');
        this.controlEl.appendChild(select);
        const dropdown = {
          addOption: (value: string, label: string) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
            return dropdown;
          },
          setValue: (value: string) => {
            select.value = value;
            return dropdown;
          },
          onChange: (fn: (value: string) => void) => {
            select.addEventListener('change', () => fn(select.value));
            return dropdown;
          },
        };
        cb(dropdown);
        return this;
      }
      addText(
        cb: (t: {
          inputEl: HTMLInputElement;
          setPlaceholder: (p: string) => unknown;
          onChange: (fn: (v: string) => void) => unknown;
        }) => void,
      ) {
        const inputEl = document.createElement('input');
        this.controlEl.appendChild(inputEl);
        const text = {
          inputEl,
          setPlaceholder: (p: string) => {
            inputEl.placeholder = p;
            return text;
          },
          onChange: (fn: (value: string) => void) => {
            inputEl.addEventListener('input', () => fn(inputEl.value));
            return text;
          },
        };
        cb(text);
        return this;
      }
      addButton(cb: (b: ButtonComponent) => void) {
        const button = new ButtonComponent();
        this.controlEl.appendChild(button.buttonEl);
        cb(button);
        return this;
      }
    }

    class Modal {
      app: unknown;
      contentEl = document.createElement('div');
      titleEl = document.createElement('div');
      constructor(app: unknown) {
        this.app = app;
      }
      open(): void {
        (this as unknown as { onOpen(): void }).onOpen();
      }
      close(): void {
        (this as unknown as { onClose(): void }).onClose();
      }
    }

    class AbstractInputSuggest<T> {
      static last: AbstractInputSuggest<unknown> | null = null;
      constructor(
        public app: unknown,
        public inputEl: HTMLInputElement,
      ) {
        AbstractInputSuggest.last = this as AbstractInputSuggest<unknown>;
      }
      close(): void {}
      selectSuggestion(_value: T): void {}
    }

    return {
      Modal,
      Setting,
      ButtonComponent,
      AbstractInputSuggest,
      Notice: jest.fn((message: string) => notices.push(message)),
      setIcon: jest.fn(),
    };
  },
  { virtual: true },
);

import {
  ModalTemplateSelectionPresenter,
  ReplaceSelectionModal,
} from '../../../src/ui/modals/replace-selection-modal';
import { ProfileSuggest } from '../../../src/ui/suggest/profile-suggest';

const SELECTION = 'PDF: [PDF](zotero://one)';

function makeDialog(profiles: FragmentProfile[] = [], text = SELECTION) {
  const state = { profiles };
  const selection = {
    citekey: 'smith2023',
    filePath: 'Reading notes/@smith2023.md',
    text,
  };
  const dialog = {
    selection,
    get inserts(): boolean {
      return selection.text === '';
    },
    diff: jest.fn((output: string) =>
      selection.text === ''
        ? [{ kind: 'added', lines: output.split('\n') }]
        : lineDiff(selection.text, output),
    ),
    templateSources: jest.fn(() => ['citation-content-template.md']),
    extract: jest.fn(
      (): Promise<TemplateFragmentMatch | null> =>
        Promise.resolve({ template: 'PDF: {{x}}', firstLine: 9, lastLine: 9 }),
    ),
    render: jest.fn((template: string) =>
      template.includes('BROKEN')
        ? { ok: false, error: new Error('Template render failed') }
        : { ok: true, value: template.replace('{{x}}', 'two links') },
    ),
    profiles: jest.fn(() => state.profiles),
    nameRejection: jest.fn((id: string, name: string) =>
      state.profiles.some((p) => p.id !== id && p.name === name.trim())
        ? 'Another profile already uses this name.'
        : undefined,
    ),
    saveProfile: jest.fn((id: string, name: string, template: string) =>
      Promise.resolve({ id: id || 'new-id', name, template }),
    ),
    apply: jest.fn(),
  };
  return dialog;
}

function openModal(dialog: ReturnType<typeof makeDialog>) {
  const modal = new ReplaceSelectionModal(
    {} as never,
    dialog as unknown as TemplateSelectionDialog,
  );
  modal.open();
  const suggest = jest.requireMock<{
    AbstractInputSuggest: { last: ProfileSuggest };
  }>('obsidian').AbstractInputSuggest.last;
  return { modal, suggest };
}

function button(
  modal: ReplaceSelectionModal,
  label: string,
): HTMLButtonElement {
  const found = [...modal.contentEl.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  );
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

function textarea(modal: ReplaceSelectionModal): HTMLTextAreaElement {
  return modal.contentEl.querySelector('textarea')!;
}

function nameInput(modal: ReplaceSelectionModal): HTMLInputElement {
  return modal.contentEl.querySelector('input')!;
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ReplaceSelectionModal', () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it('shows the selection and starts with Save and Apply disabled', () => {
    const { modal } = openModal(makeDialog());
    expect(modal.titleEl.textContent).toBe('Replace selection with template');
    expect(
      modal.contentEl.querySelector('.citation-fragment-quote')?.textContent,
    ).toBe(SELECTION);
    expect(
      modal.contentEl.querySelector('.citation-fragment-meta')?.textContent,
    ).toBe('@smith2023 · Reading notes/@smith2023.md');
    expect(button(modal, 'Save').disabled).toBe(true);
    expect(button(modal, 'Apply').disabled).toBe(true);
    expect(modal.contentEl.querySelector('select')?.value).toBe(
      'citation-content-template.md',
    );
  });

  it('extracts the template and previews the replacement', async () => {
    const dialog = makeDialog();
    const { modal } = openModal(dialog);
    button(modal, 'Extract').click();
    await flush();

    expect(dialog.extract).toHaveBeenCalledWith('citation-content-template.md');
    expect(textarea(modal).value).toBe('PDF: {{x}}');
    expect(
      modal.contentEl.querySelector('.citation-fragment-status')?.textContent,
    ).toBe('Extracted from citation-content-template.md, line 9.');
    const lines = [
      ...modal.contentEl.querySelectorAll('.citation-diff-line'),
    ].map((l) => l.textContent);
    expect(lines).toEqual([`- ${SELECTION}`, '+ PDF: two links']);
    expect(button(modal, 'Apply').disabled).toBe(false);
  });

  it('names a multi-line extraction by its line range', async () => {
    const dialog = makeDialog();
    dialog.extract.mockResolvedValue({
      template: 'a\nb',
      firstLine: 3,
      lastLine: 6,
    });
    const { modal } = openModal(dialog);
    button(modal, 'Extract').click();
    await flush();
    expect(
      modal.contentEl.querySelector('.citation-fragment-status')?.textContent,
    ).toBe('Extracted from citation-content-template.md, lines 3 to 6.');
  });

  it('warns when the template part is not found', async () => {
    const dialog = makeDialog();
    dialog.extract.mockResolvedValue(null);
    const { modal } = openModal(dialog);
    button(modal, 'Extract').click();
    await flush();
    const status = modal.contentEl.querySelector('.citation-fragment-status');
    expect(status?.classList.contains('is-warning')).toBe(true);
    expect(textarea(modal).value).toBe('');
  });

  it('disables Extract when no template is configured', () => {
    const dialog = makeDialog();
    dialog.templateSources.mockReturnValue([]);
    const { modal } = openModal(dialog);
    expect(button(modal, 'Extract').disabled).toBe(true);
  });

  it('shows a render error and keeps Apply disabled', () => {
    const { modal } = openModal(makeDialog());
    type(textarea(modal), 'BROKEN');
    expect(
      modal.contentEl.querySelector('.citation-diff-line.is-removed')
        ?.textContent,
    ).toBe('Template render failed');
    expect(button(modal, 'Apply').disabled).toBe(true);
  });

  it('applies the rendered template and closes', () => {
    const dialog = makeDialog();
    const { modal } = openModal(dialog);
    type(textarea(modal), 'PDF: {{x}}');
    button(modal, 'Apply').click();
    expect(dialog.apply).toHaveBeenCalledWith('PDF: two links');
    expect(modal.contentEl.childElementCount).toBe(0);
  });

  it('closes without applying on Cancel', () => {
    const dialog = makeDialog();
    const { modal } = openModal(dialog);
    button(modal, 'Cancel').click();
    expect(dialog.apply).not.toHaveBeenCalled();
    expect(modal.contentEl.childElementCount).toBe(0);
  });

  it('creates a profile from a typed name on Save', async () => {
    const dialog = makeDialog();
    const { modal } = openModal(dialog);
    type(textarea(modal), 'PDF: {{x}}');
    type(nameInput(modal), 'pdf-links');
    expect(button(modal, 'Save').disabled).toBe(false);
    button(modal, 'Save').click();
    await flush();
    expect(dialog.saveProfile).toHaveBeenCalledWith(
      '',
      'pdf-links',
      'PDF: {{x}}',
    );
    expect(notices).toEqual(['Citations: Profile "pdf-links" saved.']);
  });

  it('loads a picked profile and updates it on Save', async () => {
    const profile = { id: 'p1', name: 'pdf-links', template: 'PDF: {{x}}' };
    const dialog = makeDialog([profile]);
    const { modal, suggest } = openModal(dialog);
    suggest.selectSuggestion({ kind: 'profile', profile });
    expect(nameInput(modal).value).toBe('pdf-links');
    expect(textarea(modal).value).toBe('PDF: {{x}}');

    type(textarea(modal), 'PDF: {{x}} edited');
    button(modal, 'Save').click();
    await flush();
    expect(dialog.saveProfile).toHaveBeenCalledWith(
      'p1',
      'pdf-links',
      'PDF: {{x}} edited',
    );
  });

  // Saving a variant under a new name must not overwrite the picked profile;
  // only the pencil of a profile row renames.
  it('saves a different name typed after a pick as a new profile', async () => {
    const profile = { id: 'p1', name: 'pdf-links', template: 'PDF: {{x}}' };
    const dialog = makeDialog([profile]);
    const { modal, suggest } = openModal(dialog);
    suggest.selectSuggestion({ kind: 'profile', profile });

    type(nameInput(modal), 'pdf-list');
    button(modal, 'Save').click();
    await flush();
    expect(dialog.saveProfile).toHaveBeenCalledWith(
      '',
      'pdf-list',
      'PDF: {{x}}',
    );
  });

  it('keeps the picked profile when its own name is typed back', async () => {
    const profile = { id: 'p1', name: 'pdf-links', template: 'PDF: {{x}}' };
    const dialog = makeDialog([profile]);
    const { modal, suggest } = openModal(dialog);
    suggest.selectSuggestion({ kind: 'profile', profile });

    type(nameInput(modal), 'pdf-links ');
    button(modal, 'Save').click();
    await flush();
    expect(dialog.saveProfile).toHaveBeenCalledWith(
      'p1',
      'pdf-links ',
      'PDF: {{x}}',
    );
  });

  // Issue #93: with nothing selected the output is inserted at the cursor.
  it('inserts at the cursor when nothing is selected', () => {
    const dialog = makeDialog([], '');
    const { modal } = openModal(dialog);
    expect(modal.titleEl.textContent).toBe('Insert template output');
    expect(
      modal.contentEl.querySelector('.citation-fragment-quote')?.textContent,
    ).toBe('Nothing is selected: Apply inserts the output at the cursor.');
    expect(button(modal, 'Extract').disabled).toBe(true);

    type(textarea(modal), 'PDF: {{x}}');
    const lines = [
      ...modal.contentEl.querySelectorAll('.citation-diff-line'),
    ].map((l) => l.textContent);
    expect(lines).toEqual(['+ PDF: two links']);
    button(modal, 'Apply').click();
    expect(dialog.apply).toHaveBeenCalledWith('PDF: two links');
  });

  it('shows a failed template read instead of losing it', async () => {
    const dialog = makeDialog();
    dialog.extract.mockRejectedValue(new Error('EACCES'));
    const { modal } = openModal(dialog);
    button(modal, 'Extract').click();
    await flush();
    const status = modal.contentEl.querySelector('.citation-fragment-status');
    expect(status?.classList.contains('is-warning')).toBe(true);
    expect(status?.textContent).toBe(
      'Could not read citation-content-template.md: EACCES',
    );
  });

  // A partial selection is widened by the dialog model; the quote and the
  // preview must show what Apply will now replace.
  it('shows the selection widened to whole lines by an extract', async () => {
    const dialog = makeDialog([], '[PDF](zotero://one)');
    dialog.extract.mockImplementation(() => {
      dialog.selection.text = SELECTION;
      return Promise.resolve({
        template: 'PDF: {{x}}',
        firstLine: 9,
        lastLine: 9,
      });
    });
    const { modal } = openModal(dialog);
    button(modal, 'Extract').click();
    await flush();
    expect(
      modal.contentEl.querySelector('.citation-fragment-quote')?.textContent,
    ).toBe(SELECTION);
    expect(
      modal.contentEl.querySelector('.citation-fragment-status')?.textContent,
    ).toBe(
      'Extracted from citation-content-template.md, line 9. The selection now covers whole lines.',
    );
    const lines = [
      ...modal.contentEl.querySelectorAll('.citation-diff-line'),
    ].map((l) => l.textContent);
    expect(lines).toEqual([`- ${SELECTION}`, '+ PDF: two links']);
  });

  it('starts a new profile from the create row', () => {
    const profile = { id: 'p1', name: 'pdf-links', template: 'T' };
    const dialog = makeDialog([profile]);
    const { modal, suggest } = openModal(dialog);
    suggest.selectSuggestion({ kind: 'profile', profile });
    suggest.selectSuggestion({ kind: 'create', name: 'pdf' });
    expect(nameInput(modal).value).toBe('pdf');
    type(textarea(modal), 'X');
    button(modal, 'Save').click();
    expect(dialog.saveProfile).toHaveBeenCalledWith('', 'pdf', 'X');
  });

  it('shows the rejection of a taken name and disables Save', () => {
    const dialog = makeDialog([{ id: 'p1', name: 'pdf-links', template: 'T' }]);
    const { modal } = openModal(dialog);
    type(textarea(modal), 'X');
    type(nameInput(modal), 'pdf-links');
    expect(
      modal.contentEl.querySelector('.citation-fragment-error')?.textContent,
    ).toBe('Another profile already uses this name.');
    expect(button(modal, 'Save').disabled).toBe(true);
  });

  it('reports a failed save', async () => {
    const dialog = makeDialog();
    dialog.saveProfile.mockRejectedValue(new Error('disk full'));
    const { modal } = openModal(dialog);
    type(textarea(modal), 'X');
    type(nameInput(modal), 'name');
    button(modal, 'Save').click();
    await flush();
    expect(notices).toEqual(['Citations: disk full']);
  });

  it('extracts from the template picked in the dropdown', async () => {
    const dialog = makeDialog();
    dialog.templateSources.mockReturnValue(['a.md', 'b.md']);
    const { modal } = openModal(dialog);
    const select = modal.contentEl.querySelector('select')!;
    select.value = 'b.md';
    select.dispatchEvent(new Event('change'));
    button(modal, 'Extract').click();
    await flush();
    expect(dialog.extract).toHaveBeenCalledWith('b.md');
  });

  it('offers the profiles of the dialog and starts a rename from the list', () => {
    const profile = { id: 'p1', name: 'pdf-links', template: 'T' };
    const dialog = makeDialog([profile]);
    const { modal, suggest } = openModal(dialog);
    const internals = suggest as unknown as {
      getSuggestions: (q: string) => unknown[];
      handlers: { rename: (p: FragmentProfile) => void };
    };
    expect(internals.getSuggestions('')).toEqual([
      { kind: 'profile', profile },
    ]);

    internals.handlers.rename(profile);
    expect(nameInput(modal).value).toBe('pdf-links');
    type(nameInput(modal), 'renamed');
    button(modal, 'Save').click();
    expect(dialog.saveProfile).toHaveBeenCalledWith('p1', 'renamed', 'T');
  });

  it('is opened by the presenter', () => {
    const dialog = makeDialog();
    new ModalTemplateSelectionPresenter({} as never).open(
      dialog as unknown as TemplateSelectionDialog,
    );
    expect(dialog.templateSources).toHaveBeenCalled();
  });
});

describe('ProfileSuggest', () => {
  const profiles: FragmentProfile[] = [
    { id: 'p1', name: 'pdf-links', template: 'A' },
    { id: 'p2', name: 'doi', template: 'B' },
  ];
  const handlers = { pick: jest.fn(), create: jest.fn(), rename: jest.fn() };
  const suggest = new ProfileSuggest(
    {} as never,
    document.createElement('input'),
    () => profiles,
    handlers,
  );
  const rows = (query: string) =>
    (
      suggest as unknown as {
        getSuggestions: (q: string) => { kind: string; name?: string }[];
      }
    ).getSuggestions(query);

  beforeEach(() => jest.clearAllMocks());

  it('filters profiles and offers to create the typed name', () => {
    expect(rows('PDF')).toEqual([
      { kind: 'profile', profile: profiles[0] },
      { kind: 'create', name: 'PDF' },
    ]);
  });

  it('lists every profile for an empty query and no create row', () => {
    expect(rows('')).toHaveLength(2);
  });

  it('does not offer to create a name that exists', () => {
    expect(rows('doi')).toEqual([{ kind: 'profile', profile: profiles[1] }]);
  });

  it('renders a create row and a profile row with a rename button', () => {
    const create = document.createElement('div');
    suggest.renderSuggestion({ kind: 'create', name: 'pdf' }, create);
    expect(create.textContent).toBe('Create profile "pdf"');

    const row = document.createElement('div');
    suggest.renderSuggestion({ kind: 'profile', profile: profiles[0] }, row);
    expect(row.textContent).toBe('pdf-links');
    row
      .querySelector('.clickable-icon')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handlers.rename).toHaveBeenCalledWith(profiles[0]);
  });

  it('routes a chosen row to pick or create', () => {
    suggest.selectSuggestion({ kind: 'profile', profile: profiles[1] });
    suggest.selectSuggestion({ kind: 'create', name: 'new' });
    expect(handlers.pick).toHaveBeenCalledWith(profiles[1]);
    expect(handlers.create).toHaveBeenCalledWith('new');
  });
});
