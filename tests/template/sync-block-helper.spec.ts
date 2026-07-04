import Handlebars from 'handlebars';
import { registerAllHelpers } from '../../src/template/helpers';

jest.mock('obsidian', () => ({}), { virtual: true });

function render(template: string, context: Record<string, unknown> = {}) {
  const hbs = Handlebars.create();
  registerAllHelpers(hbs);
  return hbs.compile(template, { noEscape: true })(context);
}

describe('{{#syncBlock}} helper', () => {
  it('renders a callout terminated by the plugin block ID', () => {
    const out = render('{{#syncBlock "meta"}}**Year:** 2023{{/syncBlock}}');
    expect(out).toBe(
      ['> [!note] meta', '> **Year:** 2023', '> ^zc-meta'].join('\n'),
    );
  });

  it('honours type, title, and collapsed hash options', () => {
    const out = render(
      '{{#syncBlock "annots" type="quote" title="Annotations" collapsed=true}}text{{/syncBlock}}',
    );
    expect(out).toBe(
      ['> [!quote]- Annotations', '> text', '> ^zc-annots'].join('\n'),
    );
  });

  it('renders template variables inside the block', () => {
    const out = render('{{#syncBlock "meta"}}by {{author}}{{/syncBlock}}', {
      author: 'Smith',
    });
    expect(out).toContain('> by Smith');
  });

  it('quotes multi-line content including blank lines', () => {
    const out = render('{{#syncBlock "m"}}a\n\nb{{/syncBlock}}');
    expect(out).toBe(['> [!note] m', '> a', '>', '> b', '> ^zc-m'].join('\n'));
  });

  it('throws on a missing block name', () => {
    expect(() => render('{{#syncBlock}}x{{/syncBlock}}')).toThrow(
      /requires a name/,
    );
  });

  it('throws on an invalid block name', () => {
    expect(() => render('{{#syncBlock "bad name"}}x{{/syncBlock}}')).toThrow(
      /requires a name/,
    );
  });

  it('throws when used inline (not as a block helper)', () => {
    expect(() => render('{{syncBlock "meta"}}')).toThrow(/block helper/);
  });
});
