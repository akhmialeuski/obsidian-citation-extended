# Obsidian Citation Extended

This plugin for [Obsidian](https://obsidian.md) integrates your academic reference manager with the Obsidian editing experience.

![](docs/images/screenshot.png)

The plugin supports reading bibliographies in [BibTeX / BibLaTeX `.bib` format][4], [CSL-JSON format][1], [Hayagriva YAML][5], directly from the [Readwise](https://readwise.io) API, and **live from a running Zotero** — either via the [Better BibTeX][2] pull-export endpoint or through **Zotero's own local API** (Zotero 7+, no extensions required).

## Quick Start

1. Install from Obsidian's Community Plugins browser
2. Export your bibliography from [Zotero + Better BibTeX][2], Mendeley, or Paperpile
3. Add the database in plugin settings
4. Use `Ctrl+Shift+O` to search and open literature notes

For detailed setup instructions, see [Getting Started](docs/getting-started.md).

## Features

- **Open literature note** — create or open a note for any reference
- **Insert literature note link** — insert a wiki-link or markdown link
- **Insert literature note content** — insert rendered template content at cursor
- **Insert markdown citation** — insert [Pandoc-style citations][3] with presets (textcite, parencite)
- **Inline citation autocomplete** — type `@` or `[@` to get a suggestion popover backed by the same fuzzy search index
- **References sidebar** — a side panel listing every reference cited in the active note, with one-click navigation and "copy bibliography"
- **Zotero PDF annotation import** — pull native Zotero highlights into templates as structured data (text, comment, color, page, tags) with `zotero://` deep links that open the PDF at the exact annotation
- **Native Zotero connection** — read a running Zotero (7+) through its built-in local API: no Better BibTeX, no export files, native citation keys, group libraries and collection scoping
- **Readwise integration** — import highlights and documents from Readwise as citable entries
- **Refresh citation database** — manually reload all sources

See [Features](docs/features.md) for details.

## Templates

Customize your notes using [Handlebars](https://handlebarsjs.com/) templates with 25+ variables, 18+ helpers, and built-in citation style presets.

- [Template Variables](docs/templates/variables.md) — all available variables
- [Template Helpers](docs/templates/helpers.md) — comparison, string, date, author helpers
- [Template Examples](docs/templates/examples.md) — recipes for YAML frontmatter, Zettelkasten, conditional content

## Multiple Databases

Load citations from multiple `.bib`, `.json`, or `.yml` files and the Readwise API. Duplicate citekeys are preserved with database prefixes.

![Multiple Databases Settings](docs/images/settings-multiple-databases.png)

See [Data Sources](docs/data-sources.md) and [Configuration](docs/configuration.md) for details.

## Documentation

Full documentation is in the [docs/](docs/index.md) directory.

## Network Use

This plugin accesses the network only when **you** configure it to, and it never sends telemetry or analytics.

- **Readwise API (`readwise.io`)** — contacted **only** if you add a Readwise data source and supply your own API token, in order to fetch your highlights (v2) and documents (v3) as citable entries. If you set a sync interval, the plugin re-fetches from this endpoint on that schedule; otherwise it fetches on demand. Your token is stored locally in plugin settings and sent only to Readwise for authentication.
- **Local Zotero (`127.0.0.1:23119`)** — contacted **only** if you enable a live Zotero (Better BibTeX) database, to pull the bibliography export and (when "Import PDF annotations" is on) your PDF annotations via the Better BibTeX JSON-RPC endpoint. This is loopback-only traffic to Zotero running on the same machine; nothing crosses the network.
- **Local Zotero (`127.0.0.1:23119`)** — contacted **only** if you configure a live Zotero database (Better BibTeX pull export, or the native local API when you select the "Zotero (local API)" database type). This is loopback-only traffic to Zotero running on the same machine; nothing crosses the network.
- **Documentation links (`github.com`)** — the settings screen links to the plugin's documentation. These open in your browser **when you click them**; the plugin makes no automatic requests to GitHub.

All bibliography parsing happens locally. Nothing leaves your vault unless you explicitly enable the Readwise integration above.

## Development

```bash
npm run dev      # Watch mode
npm run build    # Production build
npm run lint     # ESLint
npm test         # Jest test suite
```

See [Development Guide](docs/development.md) for architecture and contribution info.

## License

MIT License.

## Support

If you find this plugin useful, consider [buying me a coffee](https://coff.ee/akhmelevskiy).

[1]: https://github.com/citation-style-language/schema#csl-json-schema
[2]: https://retorque.re/zotero-better-bibtex/
[3]: https://pandoc.org/MANUAL.html#extension-citations
[4]: http://www.bibtex.org/
[5]: https://github.com/typst/hayagriva
