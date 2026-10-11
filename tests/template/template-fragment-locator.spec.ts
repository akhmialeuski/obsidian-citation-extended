jest.mock('obsidian', () => ({}), { virtual: true });

import { TemplateService } from '../../src/template/template.service';
import { CitationsPluginSettings } from '../../src/ui/settings/settings';
import { locateTemplateFragment } from '../../src/template/template-fragment-locator';
import type { TemplateContext } from '../../src/core';

// The entry now has two PDFs; the note was created when it had one.
const CONTEXT = {
  citekey: 'smith2023',
  title: 'Main paper',
  files: [
    'C:/Users/me/Zotero/storage/EBAUJBLY/Smith 2023 - Main.pdf',
    'C:/Users/me/Zotero/storage/QW7RT2PL/Smith 2023 - Supplement.pdf',
  ],
} as unknown as TemplateContext;

const TEMPLATE = [
  '---',
  'title: {{quote title}}',
  'pdfs:',
  '{{#each (zoteroPdfURIs files)}}',
  '  - "{{this}}"',
  '{{/each}}',
  '---',
  '',
  'PDF (plain body): {{#each (zoteroPdfURIs files)}}[PDF]({{this}}) {{/each}}',
  '',
  '{{#syncBlock "pdfs" type="info" title="PDF"}}',
  '{{#each (zoteroPdfURIs files)}}',
  '- [PDF {{@index}}]({{this}})',
  '{{/each}}',
  '{{/syncBlock}}',
  '',
].join('\n');

const URI = 'zotero://open-pdf/library/items/EBAUJBLY';

describe('locateTemplateFragment', () => {
  const service = new TemplateService(new CitationsPluginSettings());
  const render = (source: string): string | null => {
    const result = service.render(source, CONTEXT);
    return result.ok ? result.value : null;
  };

  it('finds the frontmatter key and its list block', () => {
    const match = locateTemplateFragment(
      TEMPLATE,
      `pdfs:\n  - "${URI}"`,
      render,
    );
    expect(match).toEqual({
      template: [
        'pdfs:',
        '{{#each (zoteroPdfURIs files)}}',
        '  - "{{this}}"',
        '{{/each}}',
      ].join('\n'),
      firstLine: 3,
      lastLine: 6,
    });
  });

  it('finds a plain body line with an inline block', () => {
    const match = locateTemplateFragment(
      TEMPLATE,
      `PDF (plain body): [PDF](${URI})`,
      render,
    );
    expect(match).toMatchObject({ firstLine: 9, lastLine: 9 });
    expect(match?.template).toBe(
      'PDF (plain body): {{#each (zoteroPdfURIs files)}}[PDF]({{this}}) {{/each}}',
    );
  });

  it('returns a whole block statement for a line inside a callout', () => {
    const match = locateTemplateFragment(
      TEMPLATE,
      `> - [PDF 0](${URI})`,
      render,
    );
    expect(match).toMatchObject({ firstLine: 11, lastLine: 15 });
  });

  it('keeps two blocks that share a line together', () => {
    const template = [
      '{{#if title}}',
      'Title: {{title}}',
      '{{/if}}{{#each files}}',
      'File: {{this}}',
      '{{/each}}',
    ].join('\n');
    const match = locateTemplateFragment(template, 'Title: Main paper', render);
    expect(match).toMatchObject({ firstLine: 1, lastLine: 5 });
  });

  it('returns null for a template that does not parse', () => {
    expect(locateTemplateFragment('{{#each}}', 'anything', render)).toBeNull();
  });

  it('returns null when no selected line resembles the output', () => {
    expect(
      locateTemplateFragment(TEMPLATE, 'completely unrelated words', render),
    ).toBeNull();
  });

  it('returns null for a blank selection', () => {
    expect(locateTemplateFragment(TEMPLATE, '  \n ', render)).toBeNull();
  });

  it('treats a unit that fails to render as having no output', () => {
    const match = locateTemplateFragment(
      'Title: {{title}}',
      'Title: Main',
      () => null,
    );
    expect(match).toBeNull();
  });
});
