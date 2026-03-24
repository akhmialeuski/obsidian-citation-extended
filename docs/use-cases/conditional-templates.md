# Conditional Templates

## Problem

Not all bibliography entries have the same fields. A book has a publisher and ISBN, a journal article has a volume and page numbers, a conference paper has proceedings and event location. If your template blindly renders all fields for every type, you end up with empty labels and broken formatting. You need templates that adapt to the entry at hand — showing book-specific fields for books, journal-specific fields for articles, and gracefully handling missing data.

The plugin's Handlebars templates support `{{#if}}`, `{{else}}`, comparison helpers (`eq`, `ne`, `gt`, `lt`), boolean combinators (`and`, `or`, `not`), and iteration (`{{#each}}`), giving you full control over conditional rendering.

## Prerequisites

- A citation database loaded with entries of different types (articles, books, conference papers, etc.)
- A literature note content template file configured in settings
- Familiarity with basic Handlebars syntax (`{{variable}}`, `{{#if}}...{{/if}}`)

## Step-by-Step Walkthrough

### Basic Field Presence Check

The simplest conditional: render a line only when the field has a value.

1. Open your template file (e.g., `Templates/literature-note.md`).

2. Add a conditional block for the DOI field:

   ```handlebars
   {{#if DOI}}
   **DOI:** [{{DOI}}](https://doi.org/{{DOI}})
   {{/if}}
   ```

3. Save the template. Now create a literature note for an entry with a DOI:

   **Expected output:**

   ```markdown
   **DOI:** [10.1038/nature14539](https://doi.org/10.1038/nature14539)
   ```

4. Create a note for an entry without a DOI — the entire block is omitted. No empty "DOI:" label, no broken link.

### Type-Specific Rendering with `eq`

Use the `eq` helper to compare the `type` variable against a string literal.

1. Add a type-specific section to your template:

   ```handlebars
   {{#if (eq type "book")}}
   **Publisher:** {{publisher}}, {{publisherPlace}}
   **ISBN:** {{ISBN}}
   {{else if (eq type "article-journal")}}
   **Journal:** {{containerTitle}}, vol. {{volume}}, pp. {{page}}
   {{else if (eq type "paper-conference")}}
   **Conference:** {{containerTitle}}
   **Location:** {{eventPlace}}
   {{else}}
   **Source:** {{containerTitle}}
   {{/if}}
   ```

2. Create a literature note for a book entry:

   **Expected output:**

   ```markdown
   **Publisher:** MIT Press, Cambridge, MA
   **ISBN:** 978-0262035613
   ```

3. Create a note for a journal article:

   **Expected output:**

   ```markdown
   **Journal:** Nature, vol. 521, pp. 436-444
   ```

4. Create a note for a conference paper:

   **Expected output:**

   ```markdown
   **Conference:** Advances in Neural Information Processing Systems
   **Location:** Long Beach, CA
   ```

5. Create a note for any other type (e.g., `thesis`, `webpage`):

   **Expected output:**

   ```markdown
   **Source:** MIT Department of Computer Science
   ```

### Combining Conditions with `and` / `or`

1. Show a "Recent book" badge only for books published after 2020:

   ```handlebars
   {{#if (and (eq type "book") (gt year 2020))}}
   > [!note] Recent Book
   > This is a recently published book. Check for updated editions.
   {{/if}}
   ```

   **Expected output (for a book from 2023):**

   ```markdown
   > [!note] Recent Book
   > This is a recently published book. Check for updated editions.
   ```

   **Expected output (for a book from 2016):** nothing — the condition is false.

2. Show a link section when the entry has a DOI **or** a URL:

   ```handlebars
   {{#if (or DOI URL)}}
   ## Links
   {{#if DOI}}- [DOI](https://doi.org/{{DOI}}){{/if}}
   {{#if URL}}- [URL]({{URL}}){{/if}}
   {{/if}}
   ```

   **Expected output (entry with both DOI and URL):**

   ```markdown
   ## Links
   - [DOI](https://doi.org/10.1038/nature14539)
   - [URL](https://www.nature.com/articles/nature14539)
   ```

   **Expected output (entry with only URL):**

   ```markdown
   ## Links
   - [URL](https://arxiv.org/abs/1706.03762)
   ```

   **Expected output (entry with neither):** nothing.

### Negation with `not`

1. Add a warning for entries missing an abstract:

   ```handlebars
   {{#if (not abstract)}}
   > [!warning] No abstract available
   > Consider adding an abstract in your reference manager.
   {{else}}
   ## Abstract

   {{abstract}}
   {{/if}}
   ```

### Iterating Over Authors with `each`

1. Render a detailed author list with first and last names:

   ```handlebars
   ## Authors

   {{#each entry.author}}
   - {{this.given}} {{this.family}}
   {{/each}}
   ```

   **Expected output:**

   ```markdown
   ## Authors

   - Yann LeCun
   - Yoshua Bengio
   - Geoffrey Hinton
   ```

### Iterating Over Keywords

1. Convert bibliography keywords into YAML tags:

   ```handlebars
   ---
   tags:
   {{#each keywords}}
     - {{replace this " " "-"}}
   {{/each}}
   ---
   ```

   **Expected output (for keywords `["machine learning", "deep learning", "neural networks"]`):**

   ```markdown
   ---
   tags:
     - machine-learning
     - deep-learning
     - neural-networks
   ---
   ```

### Using `formatNames` with Options

1. Format the author list with configurable truncation:

   **Default (max=2):**

   ```handlebars
   {{formatNames entry.author}}
   ```

   Input: `[{family: "LeCun"}, {family: "Bengio"}, {family: "Hinton"}]`

   Output: `LeCun et al.`

2. **Show all authors (max=10):**

   ```handlebars
   {{formatNames entry.author max=10}}
   ```

   Output: `LeCun, Bengio, and Hinton`

3. **Custom "et al." text:**

   ```handlebars
   {{formatNames entry.author max=1 etAl=" and colleagues"}}
   ```

   Output: `LeCun and colleagues`

4. **Custom connector (semicolons):**

   ```handlebars
   {{formatNames entry.author max=10 connector="; "}}
   ```

   Output: `LeCun; Bengio; Hinton`

## Template Setup

Here is a complete template that combines all conditional techniques:

```handlebars
---
{{! YAML frontmatter with safe quoting }}
title: {{quote title}}
authors: {{quote authorString}}
year: {{year}}
type: {{type}}
citekey: {{citekey}}
created: {{currentDate}}
{{! Convert keywords to YAML tags }}
{{#if keywords}}
tags:
{{#each keywords}}
  - {{replace this " " "-"}}
{{/each}}
{{else}}
tags:
  - literature-note
{{/if}}
---

# {{title}}

{{! Author section with formatted names }}
**Authors:** {{formatNames entry.author max=5}}
**Year:** {{year}}

{{! Type-specific metadata }}
{{#if (eq type "book")}}
**Publisher:** {{publisher}}{{#if publisherPlace}}, {{publisherPlace}}{{/if}}
{{#if ISBN}}**ISBN:** {{ISBN}}{{/if}}
{{else if (eq type "article-journal")}}
**Journal:** {{containerTitle}}
{{#if volume}}**Volume:** {{volume}}{{/if}}
{{#if page}}**Pages:** {{page}}{{/if}}
{{else if (eq type "paper-conference")}}
**Conference:** {{containerTitle}}
{{#if eventPlace}}**Location:** {{eventPlace}}{{/if}}
{{else if (eq type "thesis")}}
**Institution:** {{publisher}}
{{else}}
{{#if containerTitle}}**In:** {{containerTitle}}{{/if}}
{{/if}}

{{! Abstract with fallback }}
{{#if abstract}}
## Abstract

{{abstract}}
{{/if}}

{{! PDF section — only when available }}
{{#if (pdfLink entry.files)}}
## PDF

{{pdfMarkdownLink entry.files}}
{{/if}}

## Notes



{{! Links section — only when there is something to link }}
{{#if (or DOI URL zoteroSelectURI)}}
## References

{{#if zoteroSelectURI}}- [Open in Zotero]({{zoteroSelectURI}}){{/if}}
{{#if DOI}}- [DOI](https://doi.org/{{DOI}}){{/if}}
{{#if URL}}- [URL]({{URL}}){{/if}}
{{/if}}
```

## Expected Result

### For a Journal Article

Entry: LeCun et al. (2015), "Deep learning", Nature

```markdown
---
title: "Deep learning"
authors: "LeCun, Bengio, Hinton"
year: 2015
type: article-journal
citekey: lecun2015
created: 2025-03-24
tags:
  - deep-learning
  - neural-networks
  - representation-learning
---

# Deep learning

**Authors:** LeCun, Bengio, and Hinton
**Year:** 2015

**Journal:** Nature
**Volume:** 521
**Pages:** 436-444

## Abstract

An introduction to a broad range of topics in deep learning...

## Notes



## References

- [Open in Zotero](zotero://select/items/@lecun2015)
- [DOI](https://doi.org/10.1038/nature14539)
```

### For a Book

Entry: Goodfellow et al. (2016), "Deep Learning", MIT Press

```markdown
---
title: "Deep Learning"
authors: "Goodfellow, Bengio, Courville"
year: 2016
type: book
citekey: goodfellow2016
created: 2025-03-24
tags:
  - literature-note
---

# Deep Learning

**Authors:** Goodfellow, Bengio, and Courville
**Year:** 2016

**Publisher:** MIT Press, Cambridge, MA
**ISBN:** 978-0262035613

## Notes



## References

- [Open in Zotero](zotero://select/items/@goodfellow2016)
- [URL](https://www.deeplearningbook.org)
```

### For a Conference Paper

Entry: Vaswani et al. (2017), "Attention Is All You Need", NeurIPS

```markdown
---
title: "Attention Is All You Need"
authors: "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin"
year: 2017
type: paper-conference
citekey: vaswani2017
created: 2025-03-24
tags:
  - attention
  - transformers
---

# Attention Is All You Need

**Authors:** Vaswani, Shazeer, Parmar, Uszkoreit, and Jones et al.
**Year:** 2017

**Conference:** Advances in Neural Information Processing Systems
**Location:** Long Beach, CA

## Abstract

The dominant sequence transduction models are based on complex recurrent...

## Notes



## References

- [Open in Zotero](zotero://select/items/@vaswani2017)
- [URL](https://arxiv.org/abs/1706.03762)
```

## Variations

### Compact Conditional (Single-Line)

For simple presence checks, you can use inline conditionals:

```handlebars
{{#if DOI}}DOI: {{DOI}} | {{/if}}{{#if URL}}URL: {{URL}}{{/if}}
```

Output for an entry with both: `DOI: 10.1038/nature14539 | URL: https://www.nature.com/...`

### Nested Conditions

You can nest `{{#if}}` blocks to any depth:

```handlebars
{{#if (eq type "article-journal")}}
  {{#if (gt year 2020)}}
    Recent article in {{containerTitle}}
  {{else}}
    Older article in {{containerTitle}}
  {{/if}}
{{/if}}
```

### Conditional Frontmatter Fields

Only include YAML fields that have values:

```handlebars
---
title: {{quote title}}
{{#if DOI}}doi: {{DOI}}{{/if}}
{{#if ISBN}}isbn: {{ISBN}}{{/if}}
{{#if volume}}volume: {{volume}}{{/if}}
---
```

## Tips

- **Common CSL types:** `article-journal`, `book`, `chapter`, `paper-conference`, `thesis`, `webpage`, `report`, `motion_picture`. Check your entries with `{{type}}` to see the exact strings.
- **`{{#if value}}` is truthy-based.** Empty strings, `undefined`, `null`, `0`, and `false` all evaluate as falsy. A field that exists but has an empty value will not render the `{{#if}}` block.
- **Use `quote` in YAML.** Always wrap string values with `{{quote}}` in YAML frontmatter. Without it, titles like `Attention: A Survey` break YAML parsing because of the colon.
- **Test your template incrementally.** Start with a simple template, create a few test notes, then add conditionals one at a time. If something renders incorrectly, use `{{quote entry}}` temporarily to inspect the raw data.
- **Helper nesting uses parentheses.** `{{#if (and (eq type "book") (gt year 2020))}}` — the inner helpers are wrapped in `()` and resolve first, left to right.
