# Creating Literature Notes

## Problem

You want to create a dedicated note for each source in your bibliography — a place to store metadata (title, authors, year), your reading notes, key ideas, and links back to the original PDF or Zotero entry. Manually creating these notes, copying metadata, and maintaining consistent formatting across hundreds of sources is tedious and error-prone.

The plugin automates this entirely: select a reference, and a fully formatted literature note is created from your template. If the note already exists, it opens the existing one instead of creating a duplicate.

## Prerequisites

- At least one citation database configured and loaded
- A literature note content template file created in your vault (e.g., `Templates/literature-note.md`)
- The template file path entered in **Settings > Citation plugin > Literature Notes > Literature note content template file**
- A literature note folder configured (default: `Reading notes`)

## Step-by-Step Walkthrough

### Creating a Literature Note for the First Time

1. Open the Command Palette (`Ctrl+P`) and search for **Citations: Open literature note** (or press your configured hotkey, e.g. `Ctrl+Shift+O`).

2. The search modal appears. Type the title, author, or citekey of the reference. For example, type `goodfellow deep learning`:

   ```
   Deep Learning
   Goodfellow, Bengio, Courville (2016)
   goodfellow2016
   ```

3. Press `Enter` to select the entry.

4. The plugin checks whether a note already exists for this citekey. Since this is the first time, it creates a new file at:

   ```
   Reading notes/@goodfellow2016.md
   ```

5. The note opens in the editor with your template rendered. If you use the recommended YAML frontmatter template, you see:

   ```markdown
   ---
   title: "Deep Learning"
   authors: "Goodfellow, Bengio, Courville"
   year: 2016
   date: 2016-11-18
   type: book
   doi:
   url: https://www.deeplearningbook.org
   citekey: goodfellow2016
   created: 2025-03-24
   tags:
     - literature-note
     - book
   ---

   # Deep Learning

   **Authors:** Goodfellow, Bengio, Courville
   **Year:** 2016
   **Journal:**

   ## Abstract

   An introduction to a broad range of topics in deep learning...

   ## Notes



   ## References

   - [Open in Zotero](zotero://select/items/@goodfellow2016)
   - [URL](https://www.deeplearningbook.org)
   ```

6. Your cursor is in the note, ready for you to start taking reading notes.

### Opening an Existing Literature Note

1. Run **Citations: Open literature note** again and search for the same reference.

2. The plugin finds the existing note at `Reading notes/@goodfellow2016.md` and opens it directly — no duplicate is created.

3. This works even if you renamed the note or moved it to a subfolder (see "Note Lookup" below).

### What Happens When You Move a Note

The plugin uses a four-step lookup to find existing notes:

1. **Exact path match** — checks `Reading notes/@goodfellow2016.md` directly
2. **Case-insensitive match** — finds the note if you changed the casing
3. **Subfolder search** — recursively scans the literature note folder for the note
4. **Vault-wide search** — scans the entire vault as a last resort

This means you can freely reorganize your literature notes into project folders, tag-based folders, or any structure you prefer. The plugin will still find them.

## Template Setup

Create a file in your vault (e.g., `Templates/literature-note.md`) with the following content:

```handlebars
---
{{! YAML frontmatter — machine-readable metadata for Dataview queries }}
title: {{quote title}}
authors: {{quote authorString}}
year: {{year}}
date: {{date}}
type: {{type}}
doi: {{DOI}}
url: {{URL}}
citekey: {{citekey}}
created: {{currentDate}}
tags:
  - literature-note
  - {{type}}
---

{{! Human-readable header }}
# {{title}}

**Authors:** {{authorString}}
**Year:** {{year}}
**Journal:** {{containerTitle}}

## Abstract

{{abstract}}

## Notes

{{! Leave empty — this is where you write your reading notes }}

## References

- [Open in Zotero]({{zoteroSelectURI}})
{{#if DOI}}- [DOI](https://doi.org/{{DOI}}){{/if}}
{{#if URL}}- [URL]({{URL}}){{/if}}
```

Then set the path in **Settings > Citation plugin > Literature Notes > Literature note content template file** to:

```
Templates/literature-note.md
```

## Expected Result

For a CSL-JSON entry like:

```json
{
  "id": "lecun2015",
  "type": "article-journal",
  "title": "Deep learning",
  "author": [
    {"family": "LeCun", "given": "Yann"},
    {"family": "Bengio", "given": "Yoshua"},
    {"family": "Hinton", "given": "Geoffrey"}
  ],
  "issued": {"date-parts": [[2015, 5, 28]]},
  "container-title": "Nature",
  "volume": "521",
  "page": "436-444",
  "DOI": "10.1038/nature14539"
}
```

The plugin creates `Reading notes/@lecun2015.md` with:

```markdown
---
title: "Deep learning"
authors: "LeCun, Bengio, Hinton"
year: 2015
date: 2015-05-28
type: article-journal
doi: 10.1038/nature14539
url:
citekey: lecun2015
created: 2025-03-24
tags:
  - literature-note
  - article-journal
---

# Deep learning

**Authors:** LeCun, Bengio, Hinton
**Year:** 2015
**Journal:** Nature

## Abstract



## Notes



## References

- [Open in Zotero](zotero://select/items/@lecun2015)
- [DOI](https://doi.org/10.1038/nature14539)
```

## Variations

### Subfolder Organization by Type

Set the **Literature note title template** to:

```handlebars
{{type}}/{{citekey}}
```

Now notes are created in type-based subfolders:

```
Reading notes/article-journal/@lecun2015.md
Reading notes/book/@goodfellow2016.md
Reading notes/paper-conference/@vaswani2017.md
```

Missing folders are created automatically.

### Subfolder Organization by Author Initial

```handlebars
{{lastname.[0]}}/{{citekey}}
```

Result:

```
Reading notes/L/@lecun2015.md
Reading notes/G/@goodfellow2016.md
Reading notes/V/@vaswani2017.md
```

### Human-Readable Filename

```handlebars
{{lastname}} {{year}} — {{titleShort}}
```

Result:

```
Reading notes/LeCun 2015 — Deep learning.md
```

### Minimal Template (No Frontmatter)

```handlebars
# {{title}} ({{year}})

{{authorString}}

> {{abstract}}
```

Result:

```markdown
# Deep learning (2015)

LeCun, Bengio, Hinton

> An introduction to a broad range of topics in deep learning...
```

### Zettelkasten-Style Template

```handlebars
---
title: {{quote title}}
citekey: {{citekey}}
type: literature
created: {{currentDate}}
---

# {{lastname}} {{year}} — {{titleShort}}

{{#if abstract}}
> [!abstract]
> {{abstract}}
{{/if}}

## Key Ideas

-

## Connections

-

## Questions

-

## Source

{{authorString}} ({{year}}). *{{title}}*. {{containerTitle}}.
```

### Disabling Automatic Note Creation

If you create literature notes through another tool (e.g., Zotero Integration plugin) and only want this plugin for opening and navigating:

1. Go to **Settings > Citation plugin > Literature Notes**
2. Enable **Disable automatic note creation**
3. Now, running **Open literature note** for a reference without an existing note shows an error instead of creating one

## Tips

- **Edit your template as a normal note.** Since the content template is a vault file, you get full syntax highlighting, preview, and version control via git.
- **Use `{{quote}}` for YAML values.** Without it, titles containing colons (like `Attention: A Survey`) break YAML parsing.
- **The `{{currentDate}}` helper** captures when the note was created, not when the source was published. Use `{{date}}` or `{{year}}` for publication dates.
- **Check your loaded variables.** Click the **Show variables** button in settings to see every field available from your library, including custom fields from your reference manager.
- **Vault-wide search is a safety net.** If you move a note to `Projects/NLP/@lecun2015.md`, the plugin still finds it. But this full vault scan is slower than the direct path check, so keep notes in the configured folder when possible.
