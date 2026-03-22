# Configuration

All settings are accessible in **Settings** > **Citation plugin**.

## Citation Databases

| Setting | Description | Default |
|---------|-------------|---------|
| Database name | Friendly label shown in search modal when the same citekey exists in multiple databases | `Database 1` |
| Database type | Format of the bibliography file (see [Database Formats](#database-formats) below) | `CSL-JSON` |
| Database path | Absolute or vault-relative path to the exported bibliography file | (empty) |

- Up to 20 databases supported
- When the same citekey appears in multiple databases, both entries are kept with a `database:citekey` display prefix
- Path validation runs automatically and shows "Path verified" or "File not found"

### Database Formats

**CSL-JSON** (`.json`) — The Citation Style Language JSON format. This is a standardized, lightweight format that most reference managers can export. It loads quickly and is the recommended choice for most users.

- **Best for:** Zotero (via "Export Library" → CSL JSON), Mendeley, Paperpile
- **Advantages:** Fast parsing, standard format, smaller file size
- **Limitations:** May not include all custom fields (e.g. PDF file paths, Zotero notes)

**BibLaTeX** (`.bib`) — A LaTeX bibliography format that carries richer metadata than CSL-JSON, including PDF file paths, keywords, abstract, and annotation notes. Parsing is slower because the BibTeX grammar is more complex.

- **Best for:** Zotero with [Better BibTeX](https://retorque.re/zotero-better-bibtex/) plugin, LaTeX users
- **Advantages:** Richer metadata (PDF paths, keywords, notes), seamless LaTeX integration
- **Limitations:** Slower to parse on large libraries (5000+ entries), larger file size
- **Note:** "Better BibTeX" refers to the Zotero plugin that exports `.bib` files; the database type in settings is called `BibLaTeX`

### Setting Up Multiple Databases

To use more than one bibliography source (e.g. personal library + shared team library):

1. Open **Settings** > **Citation plugin** > **Citation Databases**
2. Your first database is already configured — enter its name, type, and path
3. Click **Add database** to add a second entry
4. Give each database a unique name (this label appears in the search modal for duplicates)
5. If both databases contain the same citekey, the **merge strategy** controls which entry is used for note creation (see [Data Sources: Merge Strategies](data-sources.md#merge-strategies))

## Hotkeys

The plugin registers five commands but does **not** assign default hotkeys — you choose bindings that fit your workflow. To configure:

1. Open **Settings** > **Hotkeys**
2. Search for `Citations`
3. Click the `+` button next to any command to assign a key combination

**Recommended bindings** (adjust to taste):

| Command | Suggested hotkey | Rationale |
|---------|-----------------|-----------|
| Open literature note | `Ctrl+Shift+O` | Mnemonic: **O**pen note |
| Insert Markdown citation | `Ctrl+Shift+E` | Quick citation insertion while writing |
| Insert literature note link | `Ctrl+Shift+L` | Mnemonic: **L**ink |
| Insert literature note content | — | Used less frequently, assign if needed |
| Refresh citation database | — | Rarely needed (auto-reload handles most cases) |

## Literature Notes

| Setting | Description | Default |
|---------|-------------|---------|
| Literature note folder | Folder inside the vault where new notes are created | `Reading notes` |
| Disable automatic note creation | When enabled, only opens existing notes — never creates new ones | `false` |
| Literature note title template | Handlebars template for the note filename (without `.md` extension) | `@{{citekey}}` |
| Literature note content template path | Path to a vault file used as the note body template | (empty) |

The **content template path** points to a Markdown file in your vault that serves as the template body. This is the recommended approach — it lets you edit the template as a normal note with syntax highlighting. If the path is empty, an empty note body is created.

> **Migration note:** Earlier versions of the plugin used an inline text field for the content template. If you upgrade from an older version, the plugin automatically migrates your inline template to a vault file and sets the path for you.

### Subfolder Support

Use forward slashes in the title template to organize notes into subfolders:

```handlebars
{{type}}/{{citekey}}
```

This creates notes like `Reading notes/article-journal/@smith2023.md`. Missing folders are created automatically.

The plugin searches recursively in subfolders when opening notes, so manually moved notes are still found.

See [Template Examples: Subfolder Organization](templates/examples.md#subfolder-organization) for more patterns.

## Markdown Citations

| Setting | Description | Default |
|---------|-------------|---------|
| Citation style preset | Built-in style or custom (see table below) | `custom` |
| Primary citation template | Template for the main citation format | `[@{{citekey}}]` |
| Secondary citation template | Template for the alternative format (activated by **Shift+Enter** in the search modal) | `@{{citekey}}` |
| Auto-create literature note on citation | Create the literature note file when inserting a citation, if it doesn't exist yet | `false` |

### Citation Style Presets

Presets auto-fill the primary and secondary template fields. Select `custom` to define your own.

| Preset | Primary | Alternative | Use case |
|--------|---------|-------------|----------|
| textcite | `{{authorString}} ({{year}})` | `[@{{citekey}}]` | In-text narrative citation (APA/Chicago style) |
| parencite | `({{authorString}}, {{year}})` | `[@{{citekey}}]` | Parenthetical citation (APA style) |
| citekey | `[@{{citekey}}]` | `@{{citekey}}` | Pandoc-compatible citation for Markdown → PDF/DOCX workflows |
| custom | User-defined | User-defined | Full control over both templates |

When a preset is selected, the template fields are auto-filled and disabled. Switch to `custom` to edit them.

## Display

| Setting | Description | Default |
|---------|-------------|---------|
| Sort order | How references are sorted in the search modal | `Default (file order)` |

Sort options: Default, By year (newest first), By year (oldest first), By author (A to Z). Entries without the sort field are placed at the end.
