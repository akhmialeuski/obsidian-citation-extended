# Data Sources

The plugin supports loading bibliography data from multiple sources and formats.

## Supported Formats

| Format              | Extension        | Description                                                                                                                                 |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Better CSL JSON** | `.json`          | Standard citation format, fast loading                                                                                                      |
| **Better BibTeX**   | `.bib`           | Rich format with PDF paths, keywords, notes. Slower to parse but more data available                                                        |
| **Hayagriva**       | `.yml` / `.yaml` | YAML-based bibliography format used by [Typst](https://typst.app). Supports basic fields: title, author, date, DOI, URL, parent (container) |
| **Readwise**        | API              | Highlights and documents from Readwise (v2 Export + v3 Reader APIs, loaded together)                                                        |

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

| API           | What it loads                                              | Citekey format |
| ------------- | ---------------------------------------------------------- | -------------- |
| **v2 Export** | Books with nested highlights from Kindle, Instapaper, etc. | `rw-{id}`      |
| **v3 Reader** | Documents, articles, PDFs saved in Readwise Reader         | `rd-{id}`      |

**Setup:**
1. Go to **Settings** > **Citation plugin** > **Citation databases**
2. Click **Add database**
3. Change the **Database type** dropdown to **Readwise**
4. Enter your API token (get it from [readwise.io/access_token](https://readwise.io/access_token))
5. Click **Validate token** to confirm it works
6. Click **Sync now** to load data

**How it works:**
- Readwise is a regular database type -- you add it the same way you add a BibLaTeX or CSL-JSON database
- Data is fetched on each sync (manual "Sync now", plugin reload, or automatic periodic sync)
- By default, the plugin automatically syncs Readwise data every 30 minutes. You can change the interval in the **Auto-sync interval (minutes)** field on the database card, or set it to `0` to disable automatic sync. Interval changes take effect on the next sync cycle
- The automatic sync timer starts when the plugin loads and stops when the plugin unloads
- Readwise entries appear in the search modal alongside your other databases
- All standard features work: citation insertion, literature note creation, templates

**Resilience:** API requests handle the failure modes the Readwise API documents, without user intervention:

- **Rate limits (HTTP 429):** the plugin waits the server-supplied `Retry-After` interval (both the seconds and HTTP-date forms) and retries automatically, up to 3 times per request.
- **Transient failures (HTTP 5xx, dropped connections):** retried automatically with exponential backoff (1s, 2s, 4s). Client errors such as an invalid token are *not* retried and surface immediately.
- **Pagination:** cursor-paginated responses are followed to the last page, with guards against repeated or malformed cursors, so large libraries load completely.

**Incremental sync:** After the first full download, periodic and manual syncs fetch only the entries updated since the last successful sync (using the Readwise `updatedAfter` API cursor) and merge them into the locally cached set. This makes background syncs fast and cheap even for large libraries. Two consequences to be aware of:

- **Deletions are not detected incrementally.** If you delete a book or document in Readwise, it stays in the library until the next full re-fetch. Run **Citations: Refresh citation database** from the command palette to force a full re-download.
- The sync cursor is stored inside the offline cache file. Deleting the cache file simply causes the next sync to be a full download.

**Field mapping:**

| Readwise field                | Entry field                | Notes                                                      |
| ----------------------------- | -------------------------- | ---------------------------------------------------------- |
| `title`                       | `title`                    |                                                            |
| `readable_title`              | `titleShort`               | Cleaned title (v2 Export books only)                       |
| `author`                      | `authorString`, `author[]` | Parsed into structured authors                             |
| `category`                    | `type`                     | Mapped: books→book, articles→article, tweets→webpage, etc. |
| `source`                      | `source`                   | e.g. `kindle`, `instapaper`, Reader source                 |
| `source_url`                  | `URL`                      | Original source URL                                        |
| `readwise_url` / `unique_url` | `zoteroSelectURI`          | Opens in Readwise Reader app (see note below)              |
| `summary`                     | `abstract`                 |                                                            |
| `asin`                        | `asin`                     | Amazon ASIN (v2 Export books only); not mapped to ISBN     |
| `site_name`                   | `containerTitle`           | Reader (v3) — e.g. "The New Yorker"                        |
| `book_tags` / `tags`          | `keywords[]`               |                                                            |
| `document_note` / `notes`     | `documentNote`             | Document-level note (distinct from highlights)             |
| `word_count`                  | `wordCount`                | Reader (v3) entries only                                   |
| `reading_progress`            | `readingProgress`          | Reader (v3) — fraction 0..1                                |
| `location`                    | `readerLocation`           | Reader (v3) — new/later/shortlist/archive/feed             |
| `highlights[].text`           | `note`                     | Aggregated with `---` separator (backward-compatible)      |
| `highlights[]`                | `highlights[]`             | Structured per-highlight metadata (see below)              |
| `published_date`              | `issuedDate`               | Reader (v3) entries only                                   |

**Structured highlights:** In addition to the aggregated `note` string, Readwise highlights are exposed through the source-agnostic `annotations` template interface (shared with Zotero PDF annotations): each item has `text`, `comment`, `page`, `pageLabel`, `colorName`, `tags`, `openURI`, and `source: "readwise"`. Iterate with `{{#each annotations}}`. The aggregated `{{note}}` string is still available for backward compatibility.

**Reader child documents:** Highlights and notes you create inside Readwise Reader are stored as child documents. The plugin merges them into their parent document's `highlights` array (rather than discarding them). A child whose parent is outside the synced set is kept as a standalone entry.

**Readwise Reader URLs:** The `zoteroSelectURI` field (used by the "Open in Readwise" action) points to the Readwise Reader app. For v2 Export books, the plugin uses the `unique_url` field (e.g., `https://read.readwise.io/read/01abc123`) when available, falling back to the legacy `readwise_url`. For v3 Reader documents, the URL already points to the Reader app. This means the "Open in Readwise" action opens the item directly in Readwise Reader.

**Searching highlights:** Full-text search indexes the highlight/note text (truncated per entry), so a query that appears only inside a highlight will still find the entry. Title and author matches always rank above highlight-only matches.

**Offline cache:** After each successful sync, Readwise data is cached locally at `.obsidian/plugins/citation-extended/readwise-cache-<id>.json` — one file per Readwise database, keyed by its stable id, so multiple Readwise databases never collide. If the API is unavailable on the next plugin load, the cached data is used as a fallback and a warning is shown. The cache stores the full unfiltered data plus the incremental-sync cursor (`lastSyncAt`) and is overwritten only after a fully successful sync (every Readwise API responds); a partial outage leaves the previous cache intact. Import filters are re-applied when the cache is read, so changing filters always takes effect. Caches written by older plugin versions (a bare entry array) are still readable; the first sync after upgrading is a full download that rewrites the cache in the new format.

### Zotero (Better BibTeX) live connection

Loads the bibliography **directly from a running Zotero** via the [Better BibTeX](https://retorque.re/zotero-better-bibtex/) pull-export endpoint — no manual file export needed. The plugin fetches the library over the local loopback connection and parses it through the same pipeline as a file source.

**When to use:** You run Zotero with Better BibTeX on the same machine as Obsidian and want the library to stay current without re-exporting a file.

**Requirements:** Zotero must be running with the Better BibTeX extension installed. The connection is local-only (`127.0.0.1`); nothing leaves your machine.

**Setup:**
1. In Zotero, right-click a library or collection → **Download Better BibTeX export…** and copy the URL. Choose the **Better CSL JSON** (`.json`) or **BibLaTeX** (`.bib`) variant.
2. In plugin settings, add a database and set its **type** to match (Better CSL JSON or Better BibTeX).
3. Toggle **Load live from Zotero (Better BibTeX)** on, paste the URL into **Better BibTeX export URL**, and click **Test connection** to confirm Zotero answers (it reports the Zotero and BBT versions).

**Notes:** Enable **Import notes** to append `&exportNotes=true` to the export, so Zotero child notes are included and surfaced via the `{{note}}` template variable.

**PDF annotations:** Enable **Import PDF annotations** to additionally fetch the **native Zotero PDF annotations** (highlights, underlines, comments, image annotations) for every entry via the Better BibTeX JSON-RPC API. Annotations arrive as structured data — text, comment, hex color + palette name, page number, tags, and a `zotero://open-pdf/...?page=N&annotation=KEY` deep link that opens the PDF in Zotero **at the exact annotation**. They are exposed to templates as `{{annotations}}`, `{{attachments}}`, and `{{annotationCount}}` — see [Template Variables](templates/variables.md#zotero-pdf-annotations). The fetch is batched (one JSON-RPC request per 50 entries) and best-effort: if it fails, the library still loads and a warning is reported.

**Auto-sync:** There is no file to watch, so the source can poll Zotero on a configurable **Auto-sync interval (minutes)** (0 = manual only, the default). Use **Sync now** or the **Refresh citation database** command for an immediate fetch.

**Offline cache:** The last successful export — including the annotation payload — is cached at `.obsidian/plugins/citation-extended/zotero-cache-<id>.json`. If Zotero is closed or unreachable on a later load, the cached export is used so the library stays usable (with a warning).

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

| Strategy                | Behavior                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
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

- **Generic HTTP/Network sources** — fetch a bibliography from an arbitrary URL (the Zotero/Better BibTeX live connection above already covers the local-Zotero case)
