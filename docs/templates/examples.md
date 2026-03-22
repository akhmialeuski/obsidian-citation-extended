# Template Examples & Recipes

Practical templates for common academic workflows. Each example includes the template code, an explanation of its purpose, and the expected rendered output.

All templates use [Handlebars](https://handlebarsjs.com/) syntax. Variables like `{{title}}` are replaced with values from the bibliography entry. See [Variables](variables.md) for the full list and [Helpers](helpers.md) for formatting functions.

---

## Literature Note: YAML Frontmatter

A full-featured template that produces a structured literature note with machine-readable YAML frontmatter and human-readable sections. This is the recommended starting point for most users — the frontmatter enables Obsidian plugins like Dataview to query your reading notes, while the body sections guide consistent note-taking.

The `quote` helper wraps values containing special YAML characters (colons, quotes) in double quotes so the frontmatter remains valid.

```handlebars
---
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

# {{title}}

**Authors:** {{authorString}}
**Year:** {{year}}
**Journal:** {{containerTitle}}

## Abstract

{{abstract}}

## Notes


## References

- [Open in Zotero]({{zoteroSelectURI}})
{{#if DOI}}- [DOI](https://doi.org/{{DOI}}){{/if}}
{{#if URL}}- [URL]({{URL}}){{/if}}
```

**Expected output** (for entry `smith2023`):

```markdown
---
title: "Attention Is All You Need: A Survey"
authors: "Smith, Jones"
year: 2023
date: 2023-06-15
type: article-journal
doi: 10.1234/example
url: https://example.com/paper
citekey: smith2023
created: 2024-01-15
tags:
  - literature-note
  - article-journal
---

# Attention Is All You Need: A Survey

**Authors:** Smith, Jones
**Year:** 2023
**Journal:** Nature Machine Intelligence

## Abstract

This paper surveys recent advances in…

## Notes


## References

- [Open in Zotero](zotero://select/items/@smith2023)
- [DOI](https://doi.org/10.1234/example)
- [URL](https://example.com/paper)
```

---

## Literature Note: Minimal

A lightweight template for quick reference notes when you don't need frontmatter or structured sections. Best for small personal libraries or when you prefer to add structure manually after creation.

```handlebars
# {{title}} ({{year}})

{{authorString}}

> {{abstract}}
```

**Expected output:**

```markdown
# Attention Is All You Need (2023)

Smith, Jones

> This paper surveys recent advances in…
```

---

## Literature Note with PDF Link

Extends the minimal template with a clickable link to the local PDF file stored by your reference manager. The `urlEncode` helper escapes spaces and special characters in the file path so the `file://` URL works correctly on all platforms.

This template requires that your bibliography entries include a `file` field (common in BibLaTeX exports from Zotero with the Better BibTeX plugin).

```handlebars
---
title: {{quote title}}
authors: {{quote authorString}}
---

# {{title}}

[Open PDF](file://{{urlEncode entry.data.fields.file}})

{{abstract}}
```

**Expected output:**

```markdown
---
title: "Attention Is All You Need"
authors: "Smith, Jones"
---

# Attention Is All You Need

[Open PDF](file:///home/user/Zotero/storage/smith2023.pdf)

This paper surveys recent advances in…
```

---

## Conditional Content by Type

Renders different layouts depending on the CSL type of the entry (e.g. `book`, `article-journal`, `webpage`). Use this when books and journal articles need fundamentally different metadata displayed. The `eq` helper compares the `type` variable to a string literal.

Common CSL types: `article-journal`, `book`, `chapter`, `webpage`, `thesis`, `paper-conference`, `report`, `motion_picture`.

```handlebars
{{#if (eq type "book")}}
# Book: {{title}}
**Publisher:** {{publisher}}, {{publisherPlace}}
**ISBN:** {{ISBN}}
{{else if (eq type "article-journal")}}
# Article: {{title}}
**Journal:** {{containerTitle}}, vol. {{volume}}, pp. {{page}}
{{else}}
# {{title}}
{{/if}}

**Authors:** {{authorString}} ({{year}})
```

**Expected output** (for a book):

```markdown
# Book: Deep Learning
**Publisher:** MIT Press, Cambridge, MA
**ISBN:** 978-0262035613

**Authors:** Goodfellow, Bengio, Courville (2016)
```

**Expected output** (for a journal article):

```markdown
# Article: Attention Is All You Need
**Journal:** Nature Machine Intelligence, vol. 5, pp. 1-12

**Authors:** Smith, Jones (2023)
```

---

## Zettelkasten-Style Note

A template designed for the Zettelkasten (slip-box) method of note-taking. The title uses `lastname + year + short title` for quick scanning in the file explorer. The body includes scaffolding sections that encourage you to process the source actively: extract key ideas, connect them to existing notes, and formulate questions for further research.

The `titleShort` variable contains the abbreviated title if one exists in the bibliography, otherwise it falls back to the full title. The `abstract` block is wrapped in an Obsidian callout (`> [!abstract]`) and conditionally rendered only when an abstract exists.

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

**Expected output:**

```markdown
---
title: "Attention Is All You Need: A Survey"
citekey: smith2023
type: literature
created: 2024-01-15
---

# Smith 2023 — Attention Is All You Need

> [!abstract]
> This paper surveys recent advances in…

## Key Ideas

-

## Connections

-

## Questions

-

## Source

Smith, Jones (2023). *Attention Is All You Need: A Survey*. Nature Machine Intelligence.
```

---

## Author Formatting Recipes

Short snippets for common author formatting patterns. The `formatNames` helper accepts the `entry.author` array (a list of CSL Name objects with `family`, `given`, and `literal` fields) and formats them according to the `max` and `connector` options.

**First author et al., Year** — collapses multiple authors into "First et al.":
```handlebars
{{formatNames entry.author max=1}} ({{year}})
```
→ `Smith et al. (2020)`

**All authors joined with "and"** — lists every author up to the limit:
```handlebars
{{formatNames entry.author max=10 connector=" and "}}
```
→ `Smith, Jones, and Lee`

**Last names only** — manual iteration over the author array for full control:
```handlebars
{{#each entry.author}}{{this.family}}{{#unless @last}}, {{/unless}}{{/each}}
```
→ `Smith, Jones, Lee`

---

## Citation Style Recipes

Templates for the **Markdown Citation** command (not literature notes). These control what text is inserted into your document when you cite a reference.

**APA-like parenthetical** — standard in-text citation format:
```handlebars
({{formatNames entry.author max=2}}, {{year}})
```
→ `(Smith & Jones, 2020)`

**Numeric reference** — useful for numbered citation systems:
```handlebars
[{{citekey}}]
```
→ `[smith2020]`

**Inline with Obsidian link** — creates a wiki-link to the literature note with a readable display name:
```handlebars
[[{{title}}|{{formatNames entry.author max=1}}, {{year}}]]
```
→ `[[The Art of Code|Smith et al., 2020]]`

---

## Subfolder Organization

Use forward slashes in the **title template** (not the content template) to automatically organize literature notes into subfolders. The plugin creates missing folders as needed.

**By CSL type** — groups journal articles, books, etc. into separate directories:
```
Title template: {{type}}/{{citekey}}
```
→ `Reading notes/article-journal/@smith2020.md`
→ `Reading notes/book/@jones2021.md`

**By first letter of last name** — alphabetical organization:
```
Title template: {{lastname.[0]}}/{{citekey}}
```
→ `Reading notes/S/@smith2020.md`
→ `Reading notes/J/@jones2021.md`

When you open a literature note, the plugin searches recursively inside your literature note folder, so manually reorganizing notes into different subfolders won't break anything.

---

## Daily Note Backlink

Use `{{currentDate}}` in the frontmatter to create a backlink from your literature note to the daily note on which you created it. This is useful for tracking when you processed a source.

```handlebars
---
created: "[[{{currentDate}}]]"
---
```

**Expected output:**

```markdown
---
created: "[[2024-01-15]]"
---
```

Obsidian recognizes this as a link, so your daily note's backlinks pane will list all literature notes created that day.

---

## Keywords as Tags

Converts the `keywords` field from your bibliography (a comma-separated string in BibLaTeX) into Obsidian YAML tags. The `split` helper breaks the string into an array, `truncate` limits tag length, and `replace` swaps spaces for hyphens to produce valid tag names.

```handlebars
---
tags:
{{#each (split (join entry.data.fields.keywords ",") ",")}}
  - {{replace (truncate this 30) " " "-"}}
{{/each}}
---
```

**Expected output** (for keywords `machine learning, neural networks, attention mechanism`):

```markdown
---
tags:
  - machine-learning
  - neural-networks
  - attention-mechanism
---
```

---

## Selected Text Integration

When you invoke a citation command with text selected in the editor, the `{{selectedText}}` variable contains that selection. This lets you create a "cite in context" workflow — select a quote from your notes, insert a citation, and the template wraps the quote with attribution automatically.

```handlebars
## Cited in context

> {{selectedText}}

— {{authorString}} ({{year}})
```

**Expected output** (with "Transformers revolutionized NLP" selected):

```markdown
## Cited in context

> Transformers revolutionized NLP

— Smith, Jones (2023)
```
