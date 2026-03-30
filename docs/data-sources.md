# Data Sources

The plugin supports loading bibliography data from multiple sources and formats.

## Supported Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| **CSL-JSON** | `.json` | Standard citation format, fast loading |
| **BibLaTeX** | `.bib` | Rich format with PDF paths, keywords, notes. Slower to parse but more data available |
| **Hayagriva** | `.yml` / `.yaml` | YAML-based bibliography format used by [Typst](https://typst.app). Supports basic fields: title, author, date, DOI, URL, parent (container) |
| **Readwise** | API | Highlights and documents from Readwise (v2 Export + v3 Reader APIs, loaded together) |

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

### Readwise API

Loads highlights and documents directly from the Readwise API. No file export needed -- the plugin fetches data over the network.

**When to use:** If you use Readwise to collect highlights from books, articles, podcasts, or other sources, and want those highlights available as citable entries in Obsidian.

The plugin loads data from both Readwise APIs in parallel and merges the results into a single database:

| API | What it loads | Citekey format |
|-----|---------------|----------------|
| **v2 Export** | Books with nested highlights from Kindle, Instapaper, etc. | `rw-{id}` |
| **v3 Reader** | Documents, articles, PDFs saved in Readwise Reader | `rd-{id}` |

**Setup:**
1. Go to **Settings** > **Citation plugin** > **Citation databases**
2. Click **Add database**
3. Change the **Database type** dropdown to **Readwise**
4. Enter your API token (get it from [readwise.io/access_token](https://readwise.io/access_token))
5. Click **Validate token** to confirm it works
6. Click **Sync now** to load data

**How it works:**
- Readwise is a regular database type -- you add it the same way you add a BibLaTeX or CSL-JSON database
- Data is fetched on each sync (manual "Sync now" or plugin reload)
- No file watching -- Readwise data loads on demand, not in real-time
- Readwise entries appear in the search modal alongside your other databases
- All standard features work: citation insertion, literature note creation, templates

**Field mapping:**

| Readwise field | Entry field | Notes |
|---------------|-------------|-------|
| `title` | `title` | |
| `author` | `authorString`, `author[]` | Parsed into structured authors |
| `category` | `type` | Mapped: books→book, articles→article, tweets→webpage, etc. |
| `source_url` | `URL` | Original source URL |
| `readwise_url` | `zoteroSelectURI` | Opens in Readwise web app |
| `summary` | `abstract` | |
| `book_tags` / `tags` | `keywords[]` | |
| `highlights[].text` | `note` | Aggregated with `---` separator |
| `published_date` | `issuedDate` | Reader (v3) entries only |

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

- **HTTP/Network sources** — fetch bibliography from a URL
