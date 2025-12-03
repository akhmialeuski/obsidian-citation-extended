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

```
* {{citekey}}
* {{abstract}}
* {{authorString}}
* {{containerTitle}}
* {{DOI}}
* {{eprint}}
* {{eprinttype}}
* {{eventPlace}}
* {{page}}
* {{publisher}}
* {{publisherPlace}}
* {{title}}
* {{titleShort}}
* {{URL}}
* {{year}}
* {{zoteroSelectURI}}
```

In addition to these standard variables, the plugin **automatically detects other fields** present in your bibliography file (e.g., `customField`, `notes`, `file`, etc.) and makes them available as variables. You can see the full list of detected variables in the plugin settings under "Template settings".
For example, your literature note title template can simply be `@{{citekey}}` and the content template can look like:
```
---
title: {{title}}
authors: {{authorString}}
year: {{year}}
---
{{abstract}}
```

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
