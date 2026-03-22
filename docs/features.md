# Features

The plugin provides five commands, accessible via the Command Palette or custom hotkeys.

## Open Literature Note

Opens (or creates) a literature note for a selected reference.

- **Command**: `Citations: Open literature note`
- **Default hotkey**: None (configure in Obsidian Hotkeys settings)
- The title, folder, and content are configured in settings
- If "Disable automatic note creation" is enabled, only existing notes are opened
- Notes can be organized in subfolders using `/` in the title template (e.g. `{{type}}/{{citekey}}`)

`[screenshot placeholder: open-literature-note]`

## Insert Literature Note Link

Inserts a wiki-link or markdown link to a literature note.

- **Command**: `Citations: Insert literature note link`
- Respects your vault's link format preference (wiki vs markdown)
- If the note doesn't exist, it is created automatically (unless disabled in settings)

## Insert Literature Note Content

Inserts the rendered content template at the cursor position.

- **Command**: `Citations: Insert literature note content`
- Useful for adding reference metadata to an existing note
- After insertion, the cursor moves to the end of the inserted text

## Insert Markdown Citation

Inserts a Pandoc-style citation (e.g. `[@smith2023]`).

- **Command**: `Citations: Insert Markdown citation`
- Supports primary and secondary (alternative) citation formats
- Hold **Shift+Enter** in the search modal to use the secondary format
- Citation style presets available: textcite, parencite, citekey, or custom
- Optionally auto-creates the literature note on citation (configurable)
- Cursor moves to end of inserted citation for easy chaining

## Refresh Citation Database

Manually reloads all configured citation databases.

- **Command**: `Citations: Refresh citation database`
- Useful when your bibliography file was updated outside Obsidian
- The plugin also watches for file changes and reloads automatically

## Search Features

The search modal supports:

- **Full-text search** across title, author, year, and citekey
- **Fuzzy matching** (handles typos)
- **Accent-insensitive search** (e.g. "Muller" finds "Muller")
- **Prefix matching** (typing "smith" matches "Smith2023")
- **Configurable sort order**: default, by year (newest/oldest first), by author (A-Z)

`[screenshot placeholder: search-modal-features]`
