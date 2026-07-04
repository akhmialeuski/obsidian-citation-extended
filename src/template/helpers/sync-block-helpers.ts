import Handlebars from 'handlebars';
import { buildSyncBlock, isValidSyncBlockName } from '../../core';

type HandlebarsInstance = ReturnType<typeof Handlebars.create>;

/**
 * `{{#syncBlock "name" …}}…{{/syncBlock}}` — renders a plugin-owned callout.
 *
 * The block becomes a callout terminated by a `^zc-name` Obsidian block ID.
 * On note updates ("Smart sync" mode) ONLY such blocks and template-rendered
 * frontmatter keys are managed by the plugin; every other line of the note is
 * user-owned and never touched. Inside a block, user edits and library
 * changes are merged three-way against the last synced version.
 *
 * Hash options:
 * - `type`      callout type (default `note`) — e.g. `cite`, `quote`, `info`
 * - `title`     callout title (default: the block name)
 * - `collapsed` render collapsed (`[!type]-`) when true
 *
 * Example:
 *
 *   {{#syncBlock "annotations" type="quote" title="Annotations" collapsed=true}}
 *   {{#each annotations}}
 *   {{this.text}} — p. {{this.pageLabel}}
 *   {{/each}}
 *   {{/syncBlock}}
 */
export function registerSyncBlockHelpers(hbs: HandlebarsInstance): void {
  hbs.registerHelper(
    'syncBlock',
    function (this: unknown, ...args: unknown[]): string {
      const options = args[args.length - 1] as Handlebars.HelperOptions;
      if (!options || typeof options.fn !== 'function') {
        throw new Error(
          'syncBlock must be used as a block helper: {{#syncBlock "name"}}…{{/syncBlock}}',
        );
      }
      const name = args.length > 1 ? args[0] : undefined;
      if (!isValidSyncBlockName(name)) {
        throw new Error(
          'syncBlock requires a name of letters, digits, "_" or "-" — ' +
            'e.g. {{#syncBlock "metadata"}}…{{/syncBlock}}',
        );
      }

      const hash = (options.hash ?? {}) as {
        type?: unknown;
        title?: unknown;
        collapsed?: unknown;
      };
      return buildSyncBlock(name, options.fn(this), {
        type: typeof hash.type === 'string' ? hash.type : undefined,
        title: typeof hash.title === 'string' ? hash.title : undefined,
        collapsed: hash.collapsed === true,
      });
    },
  );
}
