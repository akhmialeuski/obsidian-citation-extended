# Getting Started

## Installation

Install from Obsidian's Community Plugins browser:

1. Open **Settings** > **Community plugins** > **Browse**
2. Search for **Citation Extended**
3. Click **Install**, then **Enable**

## Configuring a Citation Database

The plugin reads bibliography data from files exported by your reference manager.

### Zotero (recommended)

1. Install [Better BibTeX](https://retorque.re/zotero-better-bibtex/) in Zotero
2. Select a collection in Zotero's left sidebar
3. **File** > **Export library...** > choose **Better BibLaTeX** or **Better CSL JSON**
4. Check **Keep updated** for automatic re-export
5. Save the file somewhere accessible from your vault

### Mendeley

1. Export your library as BibTeX (`.bib` file)
2. In plugin settings select **Better BibTeX** format (the label for BibLaTeX `.bib` files)

### Paperpile

1. Enable [automatic BibTeX sync](https://forum.paperpile.com/t/new-automatic-bibtex-sync-and-overleaf-integration-public-beta/5680/3)
2. Use Hazel or similar to copy the `.bib` file to your vault

### Typst / Hayagriva

If you use [Typst](https://typst.app) for typesetting, you can use your Hayagriva `.yml` bibliography file directly:

1. In plugin settings, select **Hayagriva (YAML)** as the database format
2. Point to your `.yml` file

### Readwise

If you use [Readwise](https://readwise.io) to collect highlights, you can import them directly — no file export needed:

1. In plugin settings, click **Add database** and set the type to **Readwise**
2. Paste your API token (get it from [readwise.io/access_token](https://readwise.io/access_token))
3. Click **Validate token**, then **Sync now**

See [Readwise Integration](use-cases/readwise-integration.md) for a complete walkthrough.

### Adding the Database in Settings

1. Open plugin settings > **Citation databases**
2. Click **Add database**
3. Enter a friendly name, select the format, provide the file path
4. The status indicator will show "Path verified" when the file is found

![Database settings](images/settings-multiple-databases.png)

## Creating Your First Literature Note

1. Open the Command Palette (`Ctrl+P`) and run **Citations: Open literature note** (or press your configured hotkey, e.g. `Ctrl+Shift+O`)
2. Search for a reference by title, author, or year
3. Select a reference — the plugin creates a note using your configured template
4. The note is saved in your configured literature note folder

![Search modal](images/search-modal.png)

## Quick Reference: All Commands

| Command | What it does |
|---------|-------------|
| Open literature note | Opens (or creates) a literature note for a selected reference |
| Insert literature note link | Inserts a `[[link]]` or `[link](path)` to a literature note |
| Insert literature note content | Pastes rendered template content at cursor |
| Insert Markdown citation | Inserts `[@citekey]` or custom format at cursor |
| Insert subsequent citation | Appends to an existing citation: `[@a]` → `[@a; @b]` |
| Insert multiple citations | Multi-select mode: pick several, insert `[@a; @b; @c]` |
| Open literature note for citation at cursor | Jumps to the note for `[@citekey]` under cursor — no modal |
| Update all literature notes | Re-renders all literature notes with the current content template |
| Refresh citation database | Reloads all configured bibliography files |

See [Features](features.md) for detailed descriptions and [Configuration: Hotkeys](configuration.md#hotkeys) for recommended key bindings.
