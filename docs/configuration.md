# Configuration

All settings are accessible in **Settings** > **Citation plugin**.

## Citation Databases

| Setting | Description | Default |
|---------|-------------|---------|
| Database name | Friendly label shown in search modal for duplicates | `Database 1` |
| Database type | Format of the bibliography file | `CSL-JSON` |
| Database path | Absolute or vault-relative path to the exported file | (empty) |

- Up to 20 databases supported
- When the same citekey appears in multiple databases, both entries are kept with a `database:citekey` display prefix
- Path validation runs automatically and shows "Path verified" or "File not found"

## Literature Notes

| Setting | Description | Default |
|---------|-------------|---------|
| Literature note folder | Folder inside the vault for new notes | `Reading notes` |
| Disable automatic note creation | Only open existing notes, never create | `false` |
| Literature note title template | Handlebars template for the note filename | `@{{citekey}}` |
| Literature note content template | Inline Handlebars template for note body | YAML frontmatter |
| Literature note content template path | Path to a vault file used as template (overrides inline) | (empty) |

### Subfolder Support

Use forward slashes in the title template to organize notes into subfolders:

```handlebars
{{type}}/{{citekey}}
```

This creates notes like `Reading notes/article-journal/@smith2023.md`.

The plugin searches recursively in subfolders when opening notes, so manually moved notes are still found.

## Markdown Citations

| Setting | Description | Default |
|---------|-------------|---------|
| Citation style preset | Built-in style or custom | `custom` |
| Primary citation template | Template for the main citation format | `[@{{citekey}}]` |
| Secondary citation template | Template for the alternative format (Shift+Enter) | `@{{citekey}}` |
| Auto-create literature note on citation | Create note file when inserting a citation | `false` |

### Citation Style Presets

| Preset | Primary | Alternative |
|--------|---------|-------------|
| textcite | `{{authorString}} ({{year}})` | `[@{{citekey}}]` |
| parencite | `({{authorString}}, {{year}})` | `[@{{citekey}}]` |
| citekey | `[@{{citekey}}]` | `@{{citekey}}` |
| custom | User-defined | User-defined |

When a preset is selected, the template fields are auto-filled and disabled.

## Display

| Setting | Description | Default |
|---------|-------------|---------|
| Sort order | How references are sorted in the search modal | `Default (file order)` |

Sort options: Default, By year (newest first), By year (oldest first), By author (A to Z). Entries without the sort field are placed at the end.
