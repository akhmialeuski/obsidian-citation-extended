# Hayagriva / Typst Workflow

## Problem

You use [Typst](https://typst.app) as your typesetting system instead of LaTeX, and your bibliography is in the Hayagriva YAML format (`.yml`). You want to use the same bibliography file for both Typst document compilation and Obsidian note-taking, without maintaining a second export in BibLaTeX or CSL-JSON.

The plugin supports Hayagriva natively, so you can point it at your existing `.yml` file and immediately search, cite, and create literature notes from your Typst bibliography.

## Prerequisites

- A Hayagriva bibliography file (`.yml` or `.yaml`) containing your references
- The file saved in a location accessible from your vault

## Step-by-Step Walkthrough

### Preparing a Hayagriva Bibliography

A Hayagriva file is a YAML document where each top-level key is a citekey. Here is an example file at `/home/user/typst/bibliography.yml`:

```yaml
vaswani2017:
  type: article
  title: Attention Is All You Need
  author:
    - Ashish Vaswani
    - Noam Shazeer
    - Niki Parmar
    - Jakob Uszkoreit
    - Llion Jones
    - Aidan Gomez
    - Lukasz Kaiser
    - Illia Polosukhin
  date: 2017-06-12
  url: https://arxiv.org/abs/1706.03762
  doi: 10.48550/arXiv.1706.03762
  parent:
    title: Advances in Neural Information Processing Systems
    publisher: Curran Associates

goodfellow2016:
  type: book
  title: Deep Learning
  author:
    - Ian Goodfellow
    - Yoshua Bengio
    - Aaron Courville
  date: 2016
  url: https://www.deeplearningbook.org
  parent:
    publisher: MIT Press

lecun2015:
  type: article
  title: Deep learning
  author:
    - Yann LeCun
    - Yoshua Bengio
    - Geoffrey Hinton
  date: 2015-05-28
  doi: 10.1038/nature14539
  parent:
    title: Nature
    publisher: Nature Publishing Group
```

### Configuring the Plugin

1. Open **Settings > Citation plugin > Citation databases**.

2. Configure the database:

   ```
   Name:   Typst Bibliography
   Type:   Hayagriva (YAML)
   Path:   /home/user/typst/bibliography.yml
   ```

3. The status indicator shows "Path verified" when the file is found.

4. Close settings. The status bar updates to show the loaded entries:

   ```
   Citations: 3 entries
   ```

### Creating Literature Notes from Hayagriva Entries

1. Press `Ctrl+Shift+O` to open the literature note command.

2. Search for an entry. Type `vaswani`:

   ```
   Attention Is All You Need
   Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)
   vaswani2017
   ```

3. Press `Enter`. A literature note is created using your content template.

4. The note renders with all available fields:

   ```markdown
   ---
   title: "Attention Is All You Need"
   authors: "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin"
   year: 2017
   date: 2017-06-12
   type: article
   doi: 10.48550/arXiv.1706.03762
   url: https://arxiv.org/abs/1706.03762
   citekey: vaswani2017
   created: 2025-03-24
   tags:
     - literature-note
     - article
   ---

   # Attention Is All You Need

   **Authors:** Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin
   **Year:** 2017
   **Journal:** Advances in Neural Information Processing Systems

   ## Abstract



   ## Notes



   ## References

   - [DOI](https://doi.org/10.48550/arXiv.1706.03762)
   - [URL](https://arxiv.org/abs/1706.03762)
   ```

### Inserting Citations for Typst Documents

If you draft your Typst documents in Obsidian before compiling, set up citation templates that match Typst's citation syntax.

1. Go to **Settings > Citation plugin > Markdown Citations**.
2. Set **Citation style preset** to `custom`.
3. Set the **Primary citation template** to:

   ```handlebars
   @{{citekey}}
   ```

4. Set the **Secondary citation template** to:

   ```handlebars
   #cite(<{{citekey}}>)
   ```

5. Now when you cite, the primary format (Enter) inserts Typst's `@citekey` syntax:

   ```
   @vaswani2017
   ```

   And the secondary format (Shift+Enter) inserts the function call syntax:

   ```
   #cite(<vaswani2017>)
   ```

## Expected Result

### Hayagriva Fields Mapped to Template Variables

| Hayagriva field | Template variable | Example value |
|-----------------|-------------------|---------------|
| Top-level key | `{{citekey}}` | `vaswani2017` |
| `title` | `{{title}}` | `Attention Is All You Need` |
| `author` | `{{authorString}}` | `Vaswani, Shazeer, Parmar, ...` |
| `date` | `{{year}}`, `{{date}}` | `2017`, `2017-06-12` |
| `type` | `{{type}}` | `article` |
| `doi` | `{{DOI}}` | `10.48550/arXiv.1706.03762` |
| `url` | `{{URL}}` | `https://arxiv.org/abs/1706.03762` |
| `parent.title` | `{{containerTitle}}` | `Advances in Neural Information Processing Systems` |
| `parent.publisher` | `{{publisher}}` | `Curran Associates` |

### Literature Note for a Book

```markdown
---
title: "Deep Learning"
authors: "Goodfellow, Bengio, Courville"
year: 2016
date: 2016
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



## Notes



## References

- [URL](https://www.deeplearningbook.org)
```

## Variations

### Combining Hayagriva with Other Formats

You can use Hayagriva alongside BibLaTeX or CSL-JSON databases:

```
Database 1: Typst Bibliography — Hayagriva — /home/user/typst/bibliography.yml
Database 2: Zotero Library — BibLaTeX — /home/user/Zotero/library.bib
```

Both are loaded into the same search index. Entries from different formats are normalized internally, so templates work identically regardless of the source format.

### Vault-Relative Path

If your Hayagriva file lives inside your Obsidian vault (useful for mobile or when the file is synced):

```
Path: typst/bibliography.yml
```

### Typst-Specific Types

Hayagriva uses its own type vocabulary. Common Hayagriva types and how the plugin maps them:

| Hayagriva type | Displayed as `{{type}}` |
|----------------|-------------------------|
| `article` | `article` |
| `book` | `book` |
| `web` | `web` |
| `conference` | `conference` |
| `thesis` | `thesis` |
| `report` | `report` |

These differ from CSL types (which use `article-journal`, `paper-conference`, etc.). If your template uses `{{#if (eq type "article-journal")}}`, it will not match Hayagriva entries — use `{{#if (eq type "article")}}` instead, or handle both:

```handlebars
{{#if (or (eq type "article") (eq type "article-journal"))}}
**Journal:** {{containerTitle}}
{{/if}}
```

## Tips

- **Hayagriva author names are parsed from strings.** In Hayagriva, authors are written as plain strings (`- Yann LeCun`), not structured objects. The plugin splits the name into given and family parts automatically, but unusual name formats may not split correctly. Check the rendered `{{authorString}}` to verify.
- **The `parent` field maps to container fields.** Hayagriva uses `parent.title` for the journal or book series name, and `parent.publisher` for the publisher. These are accessible via `{{containerTitle}}` and `{{publisher}}`.
- **No PDF paths in Hayagriva.** Unlike BibLaTeX, the Hayagriva format does not have a standard field for file attachments. PDF link helpers (`pdfLink`, `pdfMarkdownLink`) will return empty strings for Hayagriva entries.
- **The `zoteroSelectURI` variable still works.** It constructs a Zotero URI from the citekey, which may or may not match a Zotero entry. If your Hayagriva citekeys do not correspond to Zotero items, the URI will not resolve in Zotero.
- **File watching works.** If you edit your `.yml` file and save, the plugin detects the change and reloads the library automatically. This is useful when you add new entries while writing.
- **Limitations.** The built-in Hayagriva parser handles common fields (title, author, date, doi, url, parent). Deeply nested or uncommon Hayagriva fields (such as `serial-number`, `archive`, or nested `parent` chains) may not be fully supported. Inspect available fields with `{{quote entry.data}}` in your template.
