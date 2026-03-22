/** @jest-environment jsdom */
import { VariableListModal } from '../../../src/ui/modals/variable-list-modal';
import type { VariableDefinition } from '../../../src/template/introspection.service';

// ---------------------------------------------------------------------------
// Polyfill Obsidian-specific HTMLElement methods for jsdom
// ---------------------------------------------------------------------------
beforeAll(() => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const proto = HTMLElement.prototype as any;

  if (!proto.empty) {
    proto.empty = function (this: HTMLElement) {
      this.innerHTML = '';
    };
  }
  if (!proto.addClass) {
    proto.addClass = function (this: HTMLElement, cls: string) {
      this.classList.add(cls);
    };
  }
  if (!proto.removeClass) {
    proto.removeClass = function (this: HTMLElement, cls: string) {
      this.classList.remove(cls);
    };
  }
  if (!proto.setText) {
    proto.setText = function (this: HTMLElement, text: string) {
      this.textContent = text;
    };
  }
  if (!proto.setAttr) {
    proto.setAttr = function (this: HTMLElement, attr: string, val: string) {
      this.setAttribute(attr, val);
    };
  }
  if (!proto.setCssProps) {
    proto.setCssProps = function (
      this: HTMLElement,
      props: Record<string, string>,
    ) {
      Object.assign(this.style, props);
    };
  }
  if (!proto.createEl) {
    proto.createEl = function (
      this: HTMLElement,
      tag: string,
      opts?: { text?: string; cls?: string },
    ): HTMLElement {
      const el = document.createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.createDiv) {
    proto.createDiv = function (
      this: HTMLElement,
      cls?: string | { cls?: string; text?: string },
    ): HTMLDivElement {
      const el = document.createElement('div');
      if (typeof cls === 'string') {
        el.className = cls;
      } else if (cls) {
        if (cls.cls) el.className = cls.cls;
        if (cls.text) el.textContent = cls.text;
      }
      this.appendChild(el);
      return el;
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

// ---------------------------------------------------------------------------
// Mock: obsidian
// ---------------------------------------------------------------------------
jest.mock(
  'obsidian',
  () => ({
    App: class {},
    Modal: class {
      app: unknown;
      contentEl: HTMLElement;
      constructor(app: unknown) {
        this.app = app;
        this.contentEl = document.createElement('div');
      }
      open() {}
      close() {}
    },
  }),
  { virtual: true },
);

describe('VariableListModal', () => {
  const sampleVariables: VariableDefinition[] = [
    { key: 'title', description: 'The title', example: 'My Paper' },
    { key: 'year', description: 'Publication year', example: '2024' },
    { key: 'citekey', description: 'Unique citekey' },
    { key: 'abstract', description: '' },
  ];

  let modal: VariableListModal;

  beforeEach(() => {
    modal = new VariableListModal({} as never, sampleVariables);
  });

  describe('onOpen()', () => {
    beforeEach(() => {
      modal.onOpen();
    });

    it('adds the modal CSS class', () => {
      expect(
        modal.contentEl.classList.contains('citation-variable-list-modal'),
      ).toBe(true);
    });

    it('renders a heading', () => {
      const h2 = modal.contentEl.querySelector('h2');
      expect(h2).not.toBeNull();
      expect(h2!.textContent).toBe('Available template variables');
    });

    it('renders a description paragraph with variable count', () => {
      const p = modal.contentEl.querySelector('p.setting-item-description');
      expect(p).not.toBeNull();
      expect(p!.textContent).toContain(`${sampleVariables.length} variables`);
    });

    it('renders a copy button with "Copy all" text and mod-cta class', () => {
      const btn = modal.contentEl.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Copy all');
      expect(btn!.classList.contains('mod-cta')).toBe(true);
    });

    it('renders a table with Variable, Description, Example headers', () => {
      const table = modal.contentEl.querySelector('table');
      expect(table).not.toBeNull();

      const ths = table!.querySelectorAll('thead th');
      expect(ths).toHaveLength(3);
      expect(ths[0].textContent).toBe('Variable');
      expect(ths[1].textContent).toBe('Description');
      expect(ths[2].textContent).toBe('Example');
    });

    it('creates one row per variable', () => {
      const rows = modal.contentEl.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(sampleVariables.length);
    });

    it('renders variable key wrapped in {{ }} inside a code element', () => {
      const firstRowCode = modal.contentEl.querySelector(
        'tbody tr:first-child td code',
      );
      expect(firstRowCode).not.toBeNull();
      expect(firstRowCode!.textContent).toBe('{{title}}');
    });

    it('renders description text in second column', () => {
      const cells = modal.contentEl.querySelectorAll('tbody tr:first-child td');
      expect(cells[1].textContent).toBe('The title');
    });

    it('renders example as code in third column when present', () => {
      const exCode = modal.contentEl.querySelector(
        'tbody tr:first-child td:last-child code',
      );
      expect(exCode).not.toBeNull();
      expect(exCode!.textContent).toBe('My Paper');
    });

    it('renders an em-dash for empty description', () => {
      // "abstract" variable (index 3) has empty description
      const rows = modal.contentEl.querySelectorAll('tbody tr');
      const descCell = rows[3].querySelectorAll('td')[1];
      expect(descCell.textContent).toBe('\u2014');
    });

    it('renders an em-dash and no code element when no example exists', () => {
      // "citekey" variable (index 2) has no example
      const rows = modal.contentEl.querySelectorAll('tbody tr');
      const exCell = rows[2].querySelectorAll('td')[2];
      expect(exCell.textContent).toBe('\u2014');
      expect(exCell.querySelector('code')).toBeNull();
    });
  });

  describe('formatAsMarkdown()', () => {
    // Access private method via type assertion
    const callFormat = (m: VariableListModal) =>
      (m as unknown as { formatAsMarkdown(): string }).formatAsMarkdown();

    it('produces a markdown table with header and separator rows', () => {
      const md = callFormat(modal);
      const lines = md.split('\n');

      expect(lines[0]).toBe('| Variable | Description | Example |');
      expect(lines[1]).toBe('|----------|-------------|---------|');
      expect(lines).toHaveLength(2 + sampleVariables.length);
    });

    it('includes code-formatted variable keys', () => {
      const md = callFormat(modal);
      expect(md).toContain('`{{title}}`');
      expect(md).toContain('`{{year}}`');
    });

    it('includes code-formatted examples', () => {
      const md = callFormat(modal);
      expect(md).toContain('`My Paper`');
      expect(md).toContain('`2024`');
    });

    it('uses em-dash for missing description and example', () => {
      const md = callFormat(modal);
      // "citekey" line: has description but no example -> example is dash
      const citekeyLine = md.split('\n').find((l) => l.includes('citekey'));
      expect(citekeyLine).toContain('\u2014');

      // "abstract" line: empty description -> description is dash
      const abstractLine = md.split('\n').find((l) => l.includes('abstract'));
      expect(abstractLine).toContain('\u2014');
    });

    it('returns only header rows when variables list is empty', () => {
      const emptyModal = new VariableListModal({} as never, []);
      const md = (
        emptyModal as unknown as { formatAsMarkdown(): string }
      ).formatAsMarkdown();
      expect(md.split('\n')).toHaveLength(2);
    });
  });

  describe('copy button click', () => {
    it('calls navigator.clipboard.writeText with markdown content', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      modal.onOpen();
      const btn = modal.contentEl.querySelector('button')!;
      btn.click();

      // Flush microtask queue
      await Promise.resolve();

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const arg = writeTextMock.mock.calls[0][0] as string;
      expect(arg).toContain('| Variable |');
      expect(arg).toContain('{{title}}');
    });

    it('changes button text to "Copied!" then reverts after 1500ms', async () => {
      jest.useFakeTimers();
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      modal.onOpen();
      const btn = modal.contentEl.querySelector('button')!;
      btn.click();

      // Flush promise chain
      await Promise.resolve();
      await Promise.resolve();

      expect(btn.textContent).toBe('Copied!');

      jest.advanceTimersByTime(1500);
      expect(btn.textContent).toBe('Copy all');

      jest.useRealTimers();
    });
  });

  describe('onClose()', () => {
    it('empties contentEl', () => {
      modal.onOpen();
      expect(modal.contentEl.children.length).toBeGreaterThan(0);

      modal.onClose();
      expect(modal.contentEl.children.length).toBe(0);
    });
  });

  describe('with empty variables list', () => {
    it('renders table with zero body rows', () => {
      const emptyModal = new VariableListModal({} as never, []);
      emptyModal.onOpen();

      const rows = emptyModal.contentEl.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(0);
    });

    it('description mentions 0 variables', () => {
      const emptyModal = new VariableListModal({} as never, []);
      emptyModal.onOpen();

      const p = emptyModal.contentEl.querySelector(
        'p.setting-item-description',
      );
      expect(p!.textContent).toContain('0 variables');
    });
  });
});
