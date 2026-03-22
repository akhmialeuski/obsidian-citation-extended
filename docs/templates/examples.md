# Template Examples & Recipes

Practical templates for common academic workflows.

## Literature Note: YAML Frontmatter

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

## Literature Note: Minimal

```handlebars
# {{title}} ({{year}})

{{authorString}}

> {{abstract}}
```

## Literature Note with PDF Link

```handlebars
---
title: {{quote title}}
authors: {{quote authorString}}
---

# {{title}}

[Open PDF](file://{{urlEncode entry.data.fields.file}})

{{abstract}}
```

## Conditional Content by Type

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

## Zettelkasten-Style Note

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

## Author Formatting Recipes

**First author et al., Year:**
```handlebars
{{formatNames entry.author max=1}} ({{year}})
→ Smith et al. (2020)
```

**All authors with "and":**
```handlebars
{{formatNames entry.author max=10 connector=" and "}}
→ Smith, Jones, and Lee
```

**Last names only:**
```handlebars
{{#each entry.author}}{{this.family}}{{#unless @last}}, {{/unless}}{{/each}}
→ Smith, Jones, Lee
```

## Citation Style Recipes

**APA-like:**
```handlebars
({{formatNames entry.author max=2}}, {{year}})
→ (Smith & Jones, 2020)
```

**Numeric reference:**
```handlebars
[{{citekey}}]
→ [smith2020]
```

**Inline with link:**
```handlebars
[[{{title}}|{{formatNames entry.author max=1}}, {{year}}]]
→ [[The Art of Code|Smith et al., 2020]]
```

## Subfolder Organization

**By type:**
```
Title template: {{type}}/{{citekey}}
→ Reading notes/article-journal/@smith2020.md
→ Reading notes/book/@jones2021.md
```

**By first letter:**
```
Title template: {{lastname.[0]}}/{{citekey}}
→ Reading notes/S/@smith2020.md
```

## Daily Note Backlink

Use `{{currentDate}}` to create a backlink to your Daily Note:

```handlebars
---
created: "[[{{currentDate}}]]"
---
```

This renders as `created: "[[2024-01-15]]"` which Obsidian recognizes as a link to your Daily Note.

## Keywords as Tags

```handlebars
---
tags:
{{#each (split (join entry.data.fields.keywords ",") ",")}}
  - {{replace (truncate this 30) " " "-"}}
{{/each}}
---
```

## Selected Text Integration

When invoking a command with text selected, `{{selectedText}}` contains that text:

```handlebars
## Cited in context

> {{selectedText}}

— {{authorString}} ({{year}})
```
