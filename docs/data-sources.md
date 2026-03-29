# Data Sources

The plugin supports loading bibliography data from multiple sources and formats.

## Supported Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| **CSL-JSON** | `.json` | Standard citation format, fast loading |
| **BibLaTeX** | `.bib` | Rich format with PDF paths, keywords, notes. Slower to parse but more data available |
| **Hayagriva** | `.yml` / `.yaml` | YAML-based bibliography format used by [Typst](https://typst.app). Supports basic fields: title, author, date, DOI, URL, parent (container) |

### Choosing a Format

**Use CSL-JSON** if you want the fastest load times and don't need PDF file paths or detailed keyword/note data from your reference manager. Most reference managers export this format natively:

- **Zotero:** File → Export Library → CSL JSON
- **Mendeley:** Tools → Export as → CSL-JSON (or use the Mendeley API)
- **Paperpile:** Export → JSON

**Use BibLaTeX** if you need access to richer metadata such as PDF file paths (`file` field), keywords, or annotation notes. This is especially useful if you use Zotero with the [Better BibTeX](https://retorque.re/zotero-better-bibtex/) plugin, which auto-exports a `.bib` file whenever your library changes:

- **Zotero + Better BibTeX:** Right-click collection → Export → Better BibLaTeX → check "Keep updated"
- The exported `.bib` file updates automatically when you add or modify references
- BibLaTeX parsing is slower than CSL-JSON (noticeable on libraries with 5000+ entries)

## Source Types

### Local File (default)

Reads from the filesystem using an absolute path or a path relative to the vault root. Uses `chokidar` for file watching on desktop — when the file changes on disk, the library reloads automatically.

**When to use:** Desktop only. Best for auto-exported files from Zotero/Better BibTeX that live outside the vault.

**Example path values:**
- Absolute: `/home/user/Zotero/library.json`
- Windows absolute: `C:\Users\me\Zotero\library.bib`
- Relative to vault: `references/library.json`

### Vault File

Reads from a file inside the Obsidian vault using the Vault API. Uses Obsidian's vault events for change detection.

**When to use:** Mobile (iOS/Android) or when your bibliography file is synced into the vault (e.g. via Obsidian Sync, iCloud, or Dropbox). Also useful if you don't want to rely on filesystem paths.

## Multiple Databases

You can configure up to 20 databases in settings. All entries are loaded and merged into a single searchable library.

### Duplicate Handling

When the same citekey appears in multiple databases:

- Both entries are preserved in the library
- In the search modal, duplicates show a display prefix: `DatabaseName:citekey` (e.g. `Personal Library:smith2023`)
- Internally, each duplicate receives a **composite citekey** in the format `citekey@<database-id>`, where `<database-id>` is a stable auto-generated identifier (e.g. `smith2023@db-1711234567-a1b2`). This composite citekey is used for literature note filenames and wiki-links
- Because the composite citekey uses the internal database id (not the display name), **renaming a database does not break existing literature notes or links**
- The merge strategy determines which entry takes precedence for note creation

> **Upgrading from an earlier version:** If you previously used multiple databases with overlapping citekeys, the composite citekey format has changed from `citekey@DatabaseName` to `citekey@<database-id>`. Literature note filenames and wiki-links that used the old format need to be updated manually. **Single-database setups are not affected.** Multi-database setups without overlapping citekeys are also not affected.

### Merge Strategies

| Strategy | Behavior |
|----------|----------|
| **Last wins** (default) | The last database in the list provides the canonical entry. Reorder databases in settings to control priority |

**Example:** You have a personal library (`My Library`) and a shared team library (`Team`). With "Last wins", entries from `Team` (listed second) override `My Library` when both have the same citekey. To reverse this, drag `My Library` below `Team` in the settings list.

### Hayagriva (YAML)

YAML-based bibliography format designed for [Typst](https://typst.app). Each top-level key is a citekey, with fields indented below it.

**Example `.yml` file:**
```yaml
smith2023:
  type: article
  title: Attention Is All You Need
  author:
    - John Smith
    - Jane Doe
  date: 2023-06-15
  url: https://example.com
  doi: 10.1234/test
  parent:
    title: Nature
    publisher: Springer

jones2022:
  type: book
  title: Machine Learning Basics
  author:
    - Bob Jones
  date: 2022
```

**When to use:** If you use Typst as your typesetting system and already maintain a Hayagriva bibliography. The plugin uses a built-in YAML parser for common Hayagriva fields — complex nested structures may need a dedicated YAML library in future versions.

## Coming Soon

- **Readwise API** — load highlights and annotations from Readwise
- **HTTP/Network sources** — fetch bibliography from a URL
