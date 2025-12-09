# Obsidian Citation Extended

This plugin for [Obsidian](https://obsidian.md) integrates your academic reference manager with the Obsidian editing experience.

![](screenshot.png)

The plugin supports reading bibliographies in [BibTeX / BibLaTeX `.bib` format][4] and [CSL-JSON format][1].

## Setup

You can install this plugin via the Obsidian "Third-party plugin interface." It requires Obsidian 0.9.20 or higher.

Once the plugin is installed, you must provide it with a bibliography file:

- If you use **Zotero** with [Better BibTeX][2]:
  - Select a collection in Zotero's left sidebar that you want to export.
  - Click `File` -> `Export library ...`. Select `Better BibLaTeX` or `Better CSL JSON` as the format. (We recommend using the BibLaTeX export unless you experience performance issues. The BibLaTeX format includes more information that you can reference from Obsidian, such as associated PDF attachments, but loads more slowly than the JSON export.)
  - You can optionally choose "Keep updated" to automatically re-export the collection -- this is recommended!
- If you use other reference managers, check their documentation for BibLaTeX or CSL-JSON export support. We plan to officially support other managers in the future.

Now open the Obsidian preferences and view the "Citations" tab. Under "Citation Databases", you can add one or more sources:

1.  Click "Add Database".
2.  Enter a friendly name for the database (e.g., "Zotero Main").
3.  Select the format (`CSL-JSON` or `BibLaTeX`).
4.  Enter the absolute path to the exported file.

After configuring your databases, you should now be able to search your references from within Obsidian!

## Usage

The plugin offers five simple features at the moment:

1. **Open literature note** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>): automatically create or open a literature note for a particular reference. The title, folder, and initial content of the note can be configured in the plugin settings.
2. **Insert literature note reference** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>): insert a link to the literature note corresponding to a particular reference.
3. **Insert literature note content in the current pane** (no hotkey by default): insert content describing a particular reference into the current pane. (This can be useful for updating literature notes you already have but which are missing reference information.)
4. **Insert Markdown citation** (no hotkey by default): insert a [Pandoc-style citation][3] for a particular reference. (The exact format of the citation can be configured in the plugin settings.)
5. **Refresh citation database** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>): manually reload the citation library from the configured database files.

### Templates
You can set up your own template for both the title and content of literature notes. The following variables can be used:

- If you use another reference manager (e.g., **Mendeley**):
  - Export your library to BibTeX format (e.g., `export.bib`).
  - In the Citations plugin settings, select `BibLaTeX` as the format and provide the path to your exported `.bib` file.
  - You can access custom fields from your `.bib` file using `{{entry.data.fields.fieldName}}`.

### Examples & Recipes

Here are some example templates for common citation styles and workflows.

#### Markdown Citations

**Alphabetic Initials** (e.g., [Vadhan'17]):
```handlebars
[[{{#if titleShort}}{{titleShort}}{{else}}{{title}}{{/if}} ({{year}})|({{#each entry.author}}{{family.[0]}}{{/each}}'{{year.[2]}}{{year.[3]}})]]
```

**Author List & Year** (e.g., [Author1 & Author2, 2023]):
```handlebars
[[{{#if titleShort}}{{titleShort}}{{else}}{{title}}{{/if}} ({{year}})|({{entry.author.[0].family}}{{#if entry.author.[2].family}} et al.{{else}}{{#if entry.author.[1].family}} & {{entry.author.[1].family}}{{/if}}{{/if}}, {{year}})]]
```

#### Literature Note

**Header with Metadata:**
```handlebars
---
title: "{{quote title}}"
year: {{year}}
author: {{#each entry.author}} 
 - "[[{{given}} {{family}}]]" {{/each}}
doi: "{{DOI}}"
tags: references
---
# {{title}}

**Authors:** {{authorString}}
**Year:** {{year}}
**Abstract:** {{abstract}}
```

**PDF Link (URL Encoded):**
```handlebars
[Open PDF](file://{{urlEncode entry.data.fields.file}})
```

**Standard Variables**:

```
* {{citekey}}
* {{abstract}}
* {{authorString}}
* {{containerTitle}}
* {{DOI}}
* {{eprint}}
* {{eprinttype}}
* {{eventPlace}}
* {{keywords}}
* {{page}}
* {{publisher}}
* {{publisherPlace}}
* {{title}}
* {{titleShort}}
```

**Detected Variables (from library)**: Any key present in the entry's data is exposed as a variable.
    - Examples: `{{abstract}}`, `{{DOI}}`, `{{keywords}}`, `{{note}}`, `{{publisher}}`, `{{URL}}`, `{{zoteroId}}`, etc.
    - *Note: These vary depending on the data available in your bibliography file.*

**Custom Access**: Access any field via `{{entry.data.fields.fieldName}}`.

[View Full Variable Reference & Advanced Usage](docs/template-variables.md)

For example, your literature note title template can simply be `@{{citekey}}` and the content template can look like:
```handlebars
---
title: {{title}}
authors: {{authorString}}
year: {{year}}
series: {{series}}
volume: {{volume}}
---
{{abstract}}

**Keywords:** {{join entry.data.fields.keywords ", "}}
```

> [!WARNING]
> **For Existing Users:** This change updates the default settings. If you have customized your literature note template, you will not see this change automatically. You should manually update your template to use `{{quote title}}` instead of `title: {{title}}` or simply wrap your title in quotes if you don't want to use the helper (though the helper is safer for titles containing quotes).

### Template Helpers

The plugin supports several Handlebars helpers to allow for conditional logic and string manipulation in your templates.

#### Comparison Helpers
- `eq`: Equal to
- `ne`: Not equal to
- `gt`: Greater than
- `lt`: Less than
- `gte`: Greater than or equal to
- `lte`: Less than or equal to

Example: `{{#if (eq type "book")}}Book{{else}}Article{{/if}}`

#### Boolean Helpers
- `and`: Logical AND
- `or`: Logical OR
- `not`: Logical NOT

Example: `{{#if (and (eq type "book") (gt year 2000))}}Modern Book{{/if}}`

#### String Helpers
- `replace`: Replace occurrences of a pattern with a replacement string.
  - Usage: `{{replace value pattern replacement}}`
  - Note: `pattern` is treated as a RegExp string.
- `truncate`: Truncate a string to a specified length.
  - Usage: `{{truncate value length}}`

#### Regex Helpers
- `match`: Extract a substring matching a regex pattern.
  - Usage: `{{match value pattern}}`

#### Array/Citation Helpers
- `join`: Join list with separator.
- `split`: Split string into list.
- `formatNames`: Format author list (supports "et al.").
  - Usage: `{{formatNames entry.author}}`

#### Formatting Helpers
- `quote`: Safely stringify a value for use in YAML/JSON (escapes quotes, etc.).
  - Usage: `{{quote value}}`

For more detailed documentation and examples, see [Template Helpers Documentation](docs/template-helpers.md).

## Multiple Databases Support

The plugin now supports loading citations from multiple databases (e.g., multiple `.bib` or `.json` files). You can configure these in the plugin settings.

![Multiple Databases Settings](settings-multiple-databases.png)

**Current Implementation:**
-   **Loading:** All entries from all configured databases are loaded into the library.
-   **Duplicate Handling:** If the same citekey exists in multiple databases, both entries are kept and displayed in the search modal.
-   **Display:** Duplicate entries are distinguished by a badge showing the source database name (e.g., `[MyDatabase] citekey`).

![Search Modal with Duplicates](search-modal-duplicates.png)

**Limitations & Open Questions:**
-   **No Merging:** There is currently no "smart merging" of entry data. If an entry exists in two databases, they are treated as separate entities.
-   **Literature Note Collisions:** If you have two entries with the same citekey in different databases, creating a literature note might be ambiguous or cause collisions if the note filename is based solely on the citekey.
-   **Linking:** It is currently unclear how to explicitly link to a specific database's entry when duplicate citekeys exist.
-   **TODO:** Implement a strategy for handling literature notes for duplicate entries (e.g., namespacing filenames) and define a clear syntax for cross-database linking.

## License

MIT License.

## Support

If you find this plugin useful and would like to support its development, please consider [buying me a coffee](https://coff.ee/akhmelevskiy).

[1]: https://github.com/citation-style-language/schema#csl-json-schema
[2]: https://retorque.re/zotero-better-bibtex/
[3]: https://pandoc.org/MANUAL.html#extension-citations
[4]: http://www.bibtex.org/
