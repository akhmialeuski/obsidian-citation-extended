/** @jest-environment jsdom */
import type {
  NoteReviewItem,
  ReviewDecision,
} from '../../../src/notes/batch/batch-update.types';

// Minimal Obsidian Modal stand-in backed by jsdom elements. The plugin's
// element helpers (createEl/createDiv/empty/addClass/setText) are attached to
// HTMLElement prototypes the way Obsidian does.
jest.mock(
  'obsidian',
  () => {
    function enhance(el: HTMLElement): HTMLElement {
      const anyEl = el as unknown as Record<string, unknown>;
      anyEl.createEl = (
        tag: string,
        opts?: { cls?: string; text?: string },
      ) => {
        const child = enhance(document.createElement(tag));
        if (opts?.cls) child.className = opts.cls;
        if (opts?.text) child.textContent = opts.text;
        el.appendChild(child);
        return child;
      };
      anyEl.createDiv = (opts?: string | { cls?: string; text?: string }) => {
        const child = enhance(document.createElement('div'));
        if (typeof opts === 'string') child.className = opts;
        else if (opts?.cls) child.className = opts.cls;
        if (typeof opts === 'object' && opts?.text) {
          child.textContent = opts.text;
        }
        el.appendChild(child);
        return child;
      };
      anyEl.empty = () => {
        el.innerHTML = '';
      };
      anyEl.addClass = (cls: string) => el.classList.add(cls);
      anyEl.setText = (text: string) => {
        el.textContent = text;
      };
      return el;
    }

    class Modal {
      app: unknown;
      contentEl = enhance(document.createElement('div'));
      titleEl = enhance(document.createElement('div'));
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

    class Setting {
      settingEl: HTMLElement;
      constructor(container: HTMLElement) {
        this.settingEl = enhance(document.createElement('div'));
        container.appendChild(this.settingEl);
      }
      setDesc(): this {
        return this;
      }
      addButton(cb: (b: unknown) => void): this {
        const el = document.createElement('button');
        this.settingEl.appendChild(el);
        const button = {
          setButtonText: (t: string) => {
            el.textContent = t;
            return button;
          },
          setCta: () => button,
          onClick: (fn: () => void) => {
            el.addEventListener('click', fn);
            return button;
          },
        };
        cb(button);
        return this;
      }
    }

    return { Modal, Setting };
  },
  { virtual: true },
);

import { UpdateReviewModal } from '../../../src/ui/modals/update-review-modal';

function makeItem(overrides: Partial<NoteReviewItem> = {}): NoteReviewItem {
  return {
    citekey: 'smith2023',
    filePath: 'Reading notes/@smith2023.md',
    hunks: [
      { kind: 'same', lines: ['unchanged'] },
      { kind: 'removed', lines: ['old line'] },
      { kind: 'added', lines: ['new line'] },
    ],
    conflictIds: ['meta'],
    ...overrides,
  };
}

function openModal(
  item: NoteReviewItem,
  remaining = 0,
): { modal: UpdateReviewModal; decision: Promise<ReviewDecision> } {
  let resolve!: (d: ReviewDecision) => void;
  const decision = new Promise<ReviewDecision>((r) => (resolve = r));
  const modal = new UpdateReviewModal({} as never, item, remaining, resolve);
  modal.open();
  return { modal, decision };
}

function buttons(modal: UpdateReviewModal): HTMLButtonElement[] {
  return [...modal.contentEl.querySelectorAll('button')];
}

function clickButton(modal: UpdateReviewModal, label: string): void {
  const button = buttons(modal).find((b) => b.textContent === label);
  if (!button) throw new Error(`No button labelled "${label}"`);
  button.click();
}

describe('UpdateReviewModal', () => {
  it('renders the diff with added and removed lines', () => {
    const { modal } = openModal(makeItem());

    const added = modal.contentEl.querySelector('.citation-diff-line.is-added');
    const removed = modal.contentEl.querySelector(
      '.citation-diff-line.is-removed',
    );
    expect(added?.textContent).toBe('+ new line');
    expect(removed?.textContent).toBe('- old line');
  });

  it('lists the conflicting units', () => {
    const { modal } = openModal(makeItem());
    expect(
      modal.contentEl.querySelector('.citation-review-conflicts')?.textContent,
    ).toContain('meta');
  });

  it('resolves "apply" when Apply is clicked', async () => {
    const { modal, decision } = openModal(makeItem());
    clickButton(modal, 'Apply');
    await expect(decision).resolves.toBe('apply');
  });

  it('resolves "take-theirs" via the library-version button', async () => {
    const { modal, decision } = openModal(makeItem());
    clickButton(modal, 'Use library version');
    await expect(decision).resolves.toBe('take-theirs');
  });

  it('hides the library-version button for clean changes', () => {
    const { modal } = openModal(makeItem({ conflictIds: [] }));
    expect(buttons(modal).map((b) => b.textContent)).not.toContain(
      'Use library version',
    );
  });

  it('previews BOTH resolutions when a take-theirs diff is provided', () => {
    const { modal } = openModal(
      makeItem({
        hunks: [{ kind: 'added', lines: ['my version wins'] }],
        hunksTakeTheirs: [{ kind: 'added', lines: ['library version wins'] }],
      }),
    );

    const headings = [
      ...modal.contentEl.querySelectorAll('.citation-review-heading'),
    ].map((h) => h.textContent);
    expect(headings).toContain('Apply (keep your edits):');
    expect(headings).toContain('Use library version:');

    // Two separate diff containers, one per resolution.
    expect(
      modal.contentEl.querySelectorAll('.citation-review-diff'),
    ).toHaveLength(2);
    expect(modal.contentEl.textContent).toContain('+ my version wins');
    expect(modal.contentEl.textContent).toContain('+ library version wins');
  });

  it('renders a single diff (no headings) for a clean change', () => {
    const { modal } = openModal(makeItem({ conflictIds: [] }));
    expect(
      modal.contentEl.querySelectorAll('.citation-review-heading'),
    ).toHaveLength(0);
    expect(
      modal.contentEl.querySelectorAll('.citation-review-diff'),
    ).toHaveLength(1);
  });

  it('offers bulk decisions only when more notes are waiting', async () => {
    const single = openModal(makeItem(), 0);
    expect(buttons(single.modal).map((b) => b.textContent)).not.toContain(
      'Apply all',
    );
    single.modal.close();
    await expect(single.decision).resolves.toBe('skip');

    const bulk = openModal(makeItem(), 3);
    clickButton(bulk.modal, 'Apply all');
    await expect(bulk.decision).resolves.toBe('apply-all');
  });

  it('resolves "skip" when closed without a choice', async () => {
    const { modal, decision } = openModal(makeItem());
    modal.close();
    await expect(decision).resolves.toBe('skip');
  });

  it('caps long diffs with a click-to-expand control', () => {
    // The hidden tail may be exactly what a destructive resolution rewrites,
    // so the user must be able to reveal all of it before deciding.
    const { modal } = openModal(
      makeItem({
        hunks: [
          {
            kind: 'added',
            lines: Array.from({ length: 450 }, (_, i) => `line ${i}`),
          },
        ],
      }),
    );

    expect(
      modal.contentEl.querySelectorAll('.citation-diff-line.is-added'),
    ).toHaveLength(400);
    const expand = modal.contentEl.querySelector(
      '.citation-diff-expand',
    ) as HTMLElement;
    expect(expand.textContent).toContain('50 more lines');

    expand.click();

    expect(
      modal.contentEl.querySelectorAll('.citation-diff-line.is-added'),
    ).toHaveLength(450);
    expect(modal.contentEl.querySelector('.citation-diff-expand')).toBeNull();
  });

  it('folds long unchanged runs in the diff', () => {
    const { modal } = openModal(
      makeItem({
        hunks: [
          { kind: 'removed', lines: ['x'] },
          {
            kind: 'same',
            lines: Array.from({ length: 30 }, (_, i) => `l${i}`),
          },
          { kind: 'added', lines: ['y'] },
        ],
      }),
    );
    const fold = modal.contentEl.querySelector('.citation-diff-line.is-fold');
    expect(fold?.textContent).toContain('unchanged lines');
  });
});
