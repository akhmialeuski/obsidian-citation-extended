# Zotero Integration

## Problem

Zotero is your reference manager, and you want a seamless workflow between Zotero and Obsidian: export your library, search and cite references in Obsidian, create literature notes with rich metadata, link back to Zotero entries, and have everything update automatically when you add new references. Setting this up correctly from the start saves hours of manual work.

This guide covers the complete Zotero-to-Obsidian pipeline, from Better BibTeX configuration to template setup with Zotero-specific features.

## Prerequisites

- [Zotero](https://www.zotero.org/) installed (version 6 or 7)
- [Better BibTeX](https://retorque.re/zotero-better-bibtex/) plugin installed in Zotero
- Obsidian Citation Extended plugin installed and enabled

## Step-by-Step Walkthrough

### Step 1: Install Better BibTeX in Zotero

1. Download the latest Better BibTeX `.xpi` file from [retorque.re/zotero-better-bibtex/installation](https://retorque.re/zotero-better-bibtex/installation/).
2. In Zotero, go to **Tools > Add-ons** (Zotero 6) or **Tools > Plugins** (Zotero 7).
3. Click the gear icon, select **Install Add-on From File**, and choose the downloaded `.xpi`.
4. Restart Zotero.

### Step 2: Export Your Library with Auto-Update

1. In Zotero, select the collection you want to export (or select **My Library** for everything).
2. Right-click the collection and choose **Export Collection** (or **File > Export Library** for the entire library).
3. In the export dialog, choose the format:
   - **Better BibLaTeX** — richer metadata (PDF paths, keywords, annotations). Recommended for most users.
   - **Better CSL JSON** — faster loading, smaller file size. Good for very large libraries (5000+) or when you do not need PDF paths.
4. Check **Keep updated**. This tells Better BibTeX to re-export the file automatically whenever you add, edit, or delete references in Zotero.
5. Choose a save location. Recommended: a folder near your vault, for example:
   - `/home/user/Zotero/obsidian-export.bib`
   - `C:\Users\me\Zotero\obsidian-export.bib`
6. Click **OK**. The file is created and will stay synchronized with your Zotero library.

### Step 3: Configure the Plugin

1. Open Obsidian, go to **Settings > Citation plugin > Citation databases**.
2. Configure the database:

   ```
   Name:   Zotero Library
   Type:   Better BibTeX      (or Better CSL JSON if you exported that format)
   Path:   /home/user/Zotero/obsidian-export.bib
   ```

3. The status indicator shows "Path verified".
4. Close settings. The status bar shows loaded entries:

   ```
   Citations: 847 entries
   ```

### Step 4: Verify Auto-Reload

1. Add a new reference in Zotero (e.g., drag a PDF or use the browser connector).
2. Wait a few seconds for Better BibTeX to re-export the `.bib` file.
3. The plugin's file watcher detects the change and reloads automatically. The status bar count increases.
4. Search for the new reference in the search modal — it should appear immediately.

If auto-reload does not trigger, run **Citations: Refresh citation database** from the Command Palette.

### Step 5: Set Up a Template with Zotero Features

Create a template file at `Templates/literature-note.md` with Zotero-specific features:

```handlebars
---
{{! YAML frontmatter with Zotero-specific fields }}
title: {{quote title}}
authors: {{quote authorString}}
year: {{year}}
date: {{date}}
type: {{type}}
doi: {{DOI}}
url: {{URL}}
citekey: {{citekey}}
{{! Zotero internal ID — useful for cross-referencing }}
zotero-id: {{zoteroId}}
created: {{currentDate}}
tags:
  - literature-note
  - {{type}}
---

# {{title}}

**Authors:** {{authorString}}
**Year:** {{year}}
**Journal:** {{containerTitle}}

{{! PDF link — only available with BibLaTeX export }}
{{#if (pdfLink entry.files)}}
## PDF

{{pdfMarkdownLink entry.files}}
{{/if}}

{{! Abstract }}
{{#if abstract}}
## Abstract

{{abstract}}
{{/if}}

{{! Zotero notes/annotations — decoded from HTML }}
{{#if note}}
## Zotero Notes

{{note}}
{{/if}}

## Reading Notes



## References

{{! Deep link to open this entry in the Zotero desktop app }}
- [Open in Zotero]({{zoteroSelectURI}})
{{#if DOI}}- [DOI](https://doi.org/{{DOI}}){{/if}}
{{#if URL}}- [URL]({{URL}}){{/if}}
```

Set the template path in settings:

**Settings > Citation plugin > Literature Notes > Literature note content template file:**

```
Templates/literature-note.md
```

### Step 6: Use the Zotero Deep Link

1. Create a literature note for any reference.
2. At the bottom of the note, click the **Open in Zotero** link.
3. Zotero opens (or comes to the foreground) and selects the corresponding entry in your library. This uses the URI:

   ```
   zotero://select/items/@lecun2015
   ```

4. From Zotero, you can edit metadata, add PDFs, or view the entry in context.

### Step 7: Search by Zotero ID

1. In Zotero, look at an entry's info panel. The "Item Key" (also called Zotero Key) is a short alphanumeric code like `W5JRT78A`.
2. In Obsidian, open the search modal and type this key:

   ```
   W5JRT78A
   ```

3. The entry associated with that Zotero key appears in the results. This is useful when you have a Zotero item open and want to quickly find it in Obsidian.

   Note: The Zotero key is available when using Better BibTeX export, which includes the `zotero-key` field in the BibLaTeX output.

### Step 8: Open PDFs from the Search Modal

1. Open any search modal.
2. Find and highlight a reference.
3. Press `Shift+Tab` to open the PDF associated with the entry.
4. Press `Tab` to open the entry in Zotero.

## Expected Result

### Literature Note for a Zotero Entry

For an entry exported from Zotero with Better BibTeX (BibLaTeX format):

```bibtex
@article{lecun2015,
  title       = {Deep learning},
  author      = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
  journal     = {Nature},
  year        = {2015},
  volume      = {521},
  pages       = {436--444},
  doi         = {10.1038/nature14539},
  file        = {/home/user/Zotero/storage/ABCD1234/lecun2015.pdf},
  keywords    = {deep learning, neural networks},
  abstract    = {Deep learning allows computational models...},
  zotero-key  = {W5JRT78A}
}
```

The generated literature note:

```markdown
---
title: "Deep learning"
authors: "LeCun, Bengio, Hinton"
year: 2015
date: 2015
type: article-journal
doi: 10.1038/nature14539
url:
citekey: lecun2015
zotero-id: W5JRT78A
created: 2025-03-24
tags:
  - literature-note
  - article-journal
---

# Deep learning

**Authors:** LeCun, Bengio, Hinton
**Year:** 2015
**Journal:** Nature

## PDF

[lecun2015](file:///home/user/Zotero/storage/ABCD1234/lecun2015.pdf)

## Abstract

Deep learning allows computational models...

## Reading Notes



## References

- [Open in Zotero](zotero://select/items/@lecun2015)
- [DOI](https://doi.org/10.1038/nature14539)
```

## Choosing Between BibLaTeX and CSL-JSON

| Feature | BibLaTeX | CSL-JSON |
|---------|----------|----------|
| PDF file paths | Yes | No |
| Keywords | Yes | Limited |
| Zotero annotations/notes | Yes (`annotation` field) | No |
| Zotero item key | Yes (`zotero-key` field) | No |
| Parsing speed | Slower | Faster |
| File size | Larger | Smaller |
| Custom fields | All BibLaTeX fields accessible | Standard CSL fields only |

**Recommendation:** Use BibLaTeX unless your library has 5000+ entries and load time is a concern. The richer metadata (PDF paths, keywords, annotations) is worth the slightly slower parsing.

## Variations

### Live connection (no file export)

Instead of exporting a file and watching it, the plugin can fetch the library **directly from a running Zotero** via Better BibTeX's pull-export endpoint. This removes the export step entirely — when you cite, the data comes straight from Zotero.

1. In Zotero, right-click a library or collection → **Download Better BibTeX export…** and copy the URL (choose the **Better CSL JSON** or **BibLaTeX** variant).
2. In plugin settings, add a database and set **Database source** to **Zotero (Better BibTeX)**. Pick the matching **Export format** (CSL JSON or BibLaTeX) on the card.
3. Paste the URL into **Better BibTeX export URL** and click **Test connection** — it reports the Zotero and Better BibTeX versions on success.
4. Optionally enable **Import notes** to pull Zotero child notes into `{{note}}`, and set an **Auto-sync interval** to re-fetch periodically.

Requirements and trade-offs:

- Zotero must be running with Better BibTeX on the same machine (the connection is local-only, `127.0.0.1`).
- When Zotero is closed, the plugin serves the last successful export from an offline cache.
- There is no file to watch, so updates arrive on the auto-sync interval or when you run **Sync now** / **Refresh citation database** (rather than instantly on change).

See [Data Sources: Zotero (Better BibTeX) live connection](../data-sources.md#zotero-better-bibtex-live-connection) for details.

### Import PDF annotations (highlights with colors and deep links)

With the live connection active, enable **Import PDF annotations** on the database card to bring your Zotero PDF reader highlights into templates as structured data. Each annotation carries its text, your comment, the color (hex + palette name), the page, tags, and a deep link that opens the PDF in Zotero **at that exact annotation**.

A template section that renders annotations as linked quotes:

```handlebars
{{#if annotationCount}}
## Annotations ({{annotationCount}})

{{#each annotations}}
> {{#if this.text}}{{this.text}}{{else}}*({{this.type}} annotation)*{{/if}}
{{#if this.comment}}> — {{this.comment}}{{/if}}
> [page {{this.pageLabel}}]({{this.openURI}})

{{/each}}
{{/if}}
```

Filter by color to give highlight colors meaning (yellow = key claims, red = critique):

```handlebars
{{#each annotations}}{{#if (eq this.colorName "red")}}
- {{this.text}} ([p. {{this.pageLabel}}]({{this.openURI}}))
{{/if}}{{/each}}
```

Notes:

- Works with both Better CSL JSON and BibLaTeX formats — annotations are fetched separately via the Better BibTeX JSON-RPC API, not from the export file.
- Clicking an annotation link opens Zotero's PDF reader on the right page with the annotation selected.
- The full field list is in [Template Variables: Zotero PDF Annotations](../templates/variables.md#annotations-source-agnostic).

### Native local API (no Better BibTeX at all)

If you don't use Better BibTeX — or want a connection that survives every Zotero update — the plugin can read a running Zotero (7 or later) through **Zotero's own local API**:

1. In Zotero: **Settings → Advanced** → enable **"Allow other applications on this computer to communicate with Zotero"**.
2. In plugin settings, add a database and set **Database source** to **Zotero (local API)**. Leave the base URL empty.
3. Optionally enter a **Group library ID** or a **Collection key** to narrow the import.
4. Click **Test connection**.

Citation keys use Zotero's native Citation Key field when present (Zotero 8+ migrates Better BibTeX keys into it automatically), fall back to a `Citation Key:` line in Extra, and are generated (`lastnameYear`) otherwise. See [Data Sources: Zotero (local API)](../data-sources.md#zotero-local-api--no-better-bibtex-required) for the full comparison with the Better BibTeX connection.

### CSL-JSON Export

If you prefer CSL-JSON:

1. In Zotero, export as **Better CSL JSON** (with "Keep updated").
2. In plugin settings, set the database type to **Better CSL JSON**.
3. All citation and note features work the same, but PDF paths, keywords, and Zotero-specific fields will not be available in templates.

### Multiple Zotero Collections

Export different Zotero collections as separate files and configure each as a database:

```
Database 1: Research Papers — Better BibTeX — /home/user/Zotero/research.bib
Database 2: Teaching Materials — Better BibTeX — /home/user/Zotero/teaching.bib
Database 3: Book Collection — Better BibTeX — /home/user/Zotero/books.bib
```

All entries appear in one unified search.

### Zotero + Mobile Access

For mobile access (iOS/Android), export the bibliography into your vault folder so it syncs via Obsidian Sync or iCloud:

1. Export from Zotero to your vault: `/path/to/vault/references/library.json`
2. In plugin settings, use a vault-relative path: `references/library.json`
3. On mobile, the file is available through the vault filesystem

Note: Auto-export from Better BibTeX only works on desktop (where Zotero runs). On mobile, you will use the last synced version of the export file.

## Tips

- **"Keep updated" is essential.** Without it, you need to manually re-export every time you add a reference. Check this box during export and never worry about it again.
- **Export a collection, not the whole library.** If your Zotero library is very large, exporting a specific collection (e.g., "Current Project") is faster and produces a smaller file. You can export multiple collections as separate databases.
- **Better BibTeX stable citekeys.** By default, Better BibTeX generates stable citekeys based on author and year (e.g., `lecun2015`). These keys do not change when you edit metadata, which is important because the plugin uses citekeys to link notes to entries. Configure the citekey format in Better BibTeX settings: **Zotero > Settings > Better BibTeX > Citation keys**.
- **The `{{note}}` variable** contains Zotero notes with HTML decoded to plain text and `<a>` tags converted to Markdown links. This is useful for pulling in annotations you made in Zotero.
- **Zotero URI scheme.** The `zotero://select/items/@citekey` URI opens Zotero and selects the item. This only works when Zotero is installed on the same machine. It does not work on mobile or on a different computer.
- **File watcher behavior.** The plugin uses `chokidar` to watch the bibliography file for changes. When Better BibTeX re-exports, chokidar detects the write and triggers a reload. This typically takes 1-3 seconds after the export completes.
