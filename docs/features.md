# Features

The plugin provides five commands, accessible via the Command Palette (`Ctrl+P`) or custom hotkeys. No hotkeys are assigned by default — configure them in **Settings** > **Hotkeys** > search for "Citations". See [Configuration: Hotkeys](configuration.md#hotkeys) for recommended bindings.

## Open Literature Note

Opens (or creates) a literature note for a selected reference.

- **Command**: `Citations: Open literature note`
- **Suggested hotkey**: `Ctrl+Shift+O`
- The title, folder, and content are configured in settings
- If "Disable automatic note creation" is enabled, only existing notes are opened
- Notes can be organized in subfolders using `/` in the title template (e.g. `{{type}}/{{citekey}}`)

**How it works:** A search modal opens where you type to find a reference by title, author, year, or citekey. Press Enter to open the corresponding literature note. If the note doesn't exist, it's created from your content template.

![Open literature note](images/open-literature-note.png)

## Insert Literature Note Link

Inserts a wiki-link or markdown link to a literature note at the cursor position.

- **Command**: `Citations: Insert literature note link`
- **Suggested hotkey**: `Ctrl+Shift+L`
- Respects your vault's link format preference (wiki `[[…]]` vs markdown `[…](…)`)
- If the note doesn't exist, it is created automatically (unless disabled in settings)

**How it works:** Select a reference from the search modal, and a link to its literature note is inserted where your cursor was. Useful for referencing sources inline while writing.

## Insert Literature Note Content

Inserts the rendered content template at the cursor position without creating a separate note file.

- **Command**: `Citations: Insert literature note content`
- Useful for adding reference metadata (frontmatter, abstract, etc.) to an existing note
- After insertion, the cursor moves to the end of the inserted text

**How it works:** Select a reference, and the content template is rendered and inserted at your cursor. This is different from "Open Literature Note" — it doesn't create a file, it pastes content inline.

## Insert Markdown Citation

Inserts a formatted citation string (e.g. `[@smith2023]`) at the cursor position.

- **Command**: `Citations: Insert Markdown citation`
- **Suggested hotkey**: `Ctrl+Shift+E`
- Supports **primary** and **secondary** citation formats
- Press **Shift+Enter** in the search modal to use the secondary (alternative) format
- Citation style presets available: textcite, parencite, citekey, or custom (see [Configuration: Citation Style Presets](configuration.md#citation-style-presets))
- Optionally auto-creates the literature note on citation (configurable)
- Cursor moves to end of inserted citation for easy chaining

**How it works:** Open the search modal, pick a reference, and the citation string is inserted at your cursor. Hold Shift when pressing Enter to use the alternative format — e.g. switch between `[@smith2023]` (primary) and `@smith2023` (secondary).

## Refresh Citation Database

Manually reloads all configured citation databases.

- **Command**: `Citations: Refresh citation database`
- Useful when your bibliography file was updated outside Obsidian or when auto-reload didn't trigger
- The plugin also watches for file changes and reloads automatically in most cases

**When to use:** You generally don't need this — the plugin auto-reloads when the bibliography file changes on disk. Use manual refresh if: (1) you edited the `.bib`/`.json` file in another application and changes aren't appearing, or (2) you switched to a different exported file.

## Search Features

The search modal supports:

- **Full-text search** across title, author, year, and citekey
- **Fuzzy matching** (handles typos — "attenshun" finds "Attention")
- **Accent-insensitive search** (e.g. "Muller" finds "Müller", "Gomez" finds "Gómez")
- **Prefix matching** (typing "smith" matches "Smith2023", "Smithson2021", etc.)
- **Configurable sort order**: default, by year (newest/oldest first), by author (A-Z)

The search index is rebuilt each time the library loads. On a typical library (1000-5000 entries) this takes under 200ms.

![Search modal](images/search-modal-features.png)
