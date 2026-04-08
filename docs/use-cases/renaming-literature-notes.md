# Renaming Literature Notes

By default, the plugin locates literature notes by their filename (generated from the title template). If you rename a note, the plugin can no longer find it and creates a duplicate. The **Note identifier field** setting adds a frontmatter-based fallback that lets you rename notes freely.

## Prerequisites

- A configured content template with a citekey (or other identifier) in the frontmatter
- The **Note identifier field** setting filled in

## Step-by-step Setup

### 1. Add an identifier to your content template

Open your content template file (e.g. `Templates/literature-note.md`) and ensure the frontmatter includes a field that uniquely identifies each library entry:

```yaml
---
citekey: {{citekey}}
title: {{quote title}}
authors: {{quote authorString}}
year: {{year}}
---
```

The `citekey` field is the most reliable identifier since every library entry has one.

### 2. Configure the setting

1. Open **Settings** > **Citation plugin** > **Literature notes**
2. In the **Note identifier field** text box, type `citekey`
3. The setting takes effect immediately — no reload needed

### 3. Re-render existing notes (optional)

If you have existing literature notes that were created before adding `citekey` to the template, they won't have the frontmatter field. To add it:

1. Run **Citations: Update all literature notes** from the Command Palette
2. This re-renders all notes using your updated template, adding the `citekey` field

### 4. Rename notes freely

Now you can rename any literature note:

- `@smith2023.md` -> `Smith - 2023 - Attention Is All You Need.md`
- `@jones2020.md` -> `My favorite paper on transformers.md`

The plugin will still find them via the `citekey` frontmatter field.

## How It Works

When you run **Open literature note** or any command that looks up a note, the plugin tries five lookup strategies in order:

1. Exact filename match
2. Case-insensitive filename match
3. Filename match in subfolders
4. Vault-wide filename match
5. **Frontmatter field match** — scans all vault markdown files for a note where the configured frontmatter field equals the target citekey

Step 5 only runs when the previous four steps found nothing, and only when the **Note identifier field** setting is not empty. The lookup uses Obsidian's in-memory metadata cache, so there is no performance penalty from reading files.

## Using a Custom Identifier Field

The field name is configurable. Instead of `citekey`, you can use any field from your template:

| Scenario                      | Field name | Template line              |
| ----------------------------- | ---------- | -------------------------- |
| Standard (recommended)        | `citekey`  | `citekey: {{citekey}}`     |
| Zotero item key               | `zoteroId` | `zoteroId: {{zoteroId}}`   |
| DOI-based                     | `DOI`      | `DOI: {{DOI}}`             |

## Limitations

- Notes created before the frontmatter field was added to the template won't be found by this method until the field is added (manually or via batch update)
- If multiple notes share the same frontmatter value, the first match is returned
- The lookup is case-sensitive — `Smith2023` does not match `smith2023`
