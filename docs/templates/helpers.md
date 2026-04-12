# Template Helpers

Helpers extend Handlebars with custom logic for use inside `{{...}}` expressions. The plugin registers **22 helpers** across five categories. All helpers are available in both literature note templates and citation templates.

Helpers can be **nested** using parentheses — the inner helper resolves first:

```handlebars
{{#if (and (eq type "book") (gt year 2020))}}
  Modern book by {{formatNames entry.author max=3}}
{{else}}
  {{truncate title 40}} ({{year}})
{{/if}}
```

---

## Comparison Helpers

Used inside `{{#if}}` blocks to compare two values. Return `true` or `false`.

### `eq` — Equal

Tests loose equality (`==`) between two values. Loose comparison is intentional so that `{{eq year "2023"}}` matches both the number `2023` and the string `"2023"`.

```handlebars
{{#if (eq type "book")}}This is a book{{/if}}
```

**Input:** entry with `type: "book"`
**Output:** `This is a book`

### `ne` — Not equal

Opposite of `eq`. Returns `true` when the values differ.

```handlebars
{{#if (ne type "article-journal")}}Not a journal article{{/if}}
```

**Input:** entry with `type: "book"`
**Output:** `Not a journal article`

### `gt` — Greater than

Numeric comparison. Useful for filtering by year or volume.

```handlebars
{{#if (gt year 2000)}}Published after 2000{{/if}}
```

**Input:** entry with `year: 2023`
**Output:** `Published after 2000`

### `lt` — Less than

```handlebars
{{#if (lt year 1990)}}Classic paper{{/if}}
```

**Input:** entry with `year: 1985`
**Output:** `Classic paper`

### `gte` — Greater than or equal

```handlebars
{{#if (gte year 2020)}}Recent publication{{/if}}
```

**Input:** entry with `year: 2020`
**Output:** `Recent publication`

### `lte` — Less than or equal

```handlebars
{{#if (lte year 1999)}}20th century{{/if}}
```

**Input:** entry with `year: 1999`
**Output:** `20th century`

---

## Boolean Helpers

Combine multiple conditions into a single boolean expression.

### `and` — Logical AND

Returns `true` only when **all** arguments are truthy. Accepts any number of arguments.

```handlebars
{{#if (and (eq type "book") (gt year 2000))}}Modern book{{/if}}
```

**Input:** entry with `type: "book"`, `year: 2023`
**Output:** `Modern book`

```handlebars
{{! Three conditions: }}
{{#if (and title authorString year)}}Complete entry{{/if}}
```

**Input:** entry with all three fields populated
**Output:** `Complete entry`

### `or` — Logical OR

Returns `true` when **at least one** argument is truthy. Accepts any number of arguments.

```handlebars
{{#if (or (eq type "book") (eq type "thesis"))}}Book or thesis{{/if}}
```

**Input:** entry with `type: "thesis"`
**Output:** `Book or thesis`

### `not` — Logical NOT

Inverts a boolean value. Useful for "if absent" checks.

```handlebars
{{#if (not abstract)}}No abstract available{{/if}}
```

**Input:** entry with `abstract: undefined`
**Output:** `No abstract available`

```handlebars
{{#if (not (eq type "article-journal"))}}Not a journal article{{/if}}
```

---

## String Helpers

Manipulate text values — replace characters, trim length, extract substrings.

### `replace`

Replace all occurrences matching a **regex pattern** with a replacement string. The pattern is compiled as a JavaScript regular expression with the global (`g`) flag. If the pattern is invalid regex, the original value is returned unchanged and a warning is logged.

```handlebars
{{replace title ":" " —"}}
```

**Input:** `title: "Attention: A Survey"`
**Output:** `Attention — A Survey`

```handlebars
{{replace authorString "," " and"}}
```

**Input:** `authorString: "Smith, Jones, Lee"`
**Output:** `Smith and Jones and Lee`

```handlebars
{{! Remove all digits: }}
{{replace title "\\d" ""}}
```

**Input:** `title: "Chapter 3: Results"`
**Output:** `Chapter : Results`

### `truncate`

Limit a string to a maximum number of characters. Does **not** append an ellipsis — combine with a literal `…` if desired. Returns the original string if it's already shorter than the limit.

```handlebars
{{truncate title 30}}
```

**Input:** `title: "Attention Is All You Need: A Comprehensive Survey"`
**Output:** `Attention Is All You Need: A C`

```handlebars
{{truncate abstract 100}}…
```

**Input:** `abstract: "This paper presents..." (200 chars)`
**Output:** first 100 characters followed by `…`

### `match`

Extract the **first match** of a regex pattern from a string. Returns an empty string if there is no match or the pattern is invalid.

```handlebars
{{match date "\\d{4}"}}
```

**Input:** `date: "2023-06-15"`
**Output:** `2023`

```handlebars
{{match URL "https?://[^/]+"}}
```

**Input:** `URL: "https://example.com/paper/123"`
**Output:** `https://example.com`

### `quote`

Wraps a value in double quotes using `JSON.stringify()`. This escapes internal quotes, backslashes, and other special characters, making the output safe for YAML frontmatter where colons, quotes, or other characters would break parsing.

```handlebars
title: {{quote title}}
```

**Input:** `title: "Attention Is All You Need: A Survey"`
**Output:** `title: "Attention Is All You Need: A Survey"`

```handlebars
authors: {{quote authorString}}
```

**Input:** `authorString: 'O'Brien, "Doc" Smith'`
**Output:** `authors: "O'Brien, \"Doc\" Smith"`

**Why use `quote`?** Without it, a YAML field like `title: Attention: A Survey` is invalid because YAML interprets the second colon as a key separator. `quote` wraps the value in double quotes so YAML treats it as a single string.

---

## Date Helpers

### `currentDate`

Insert the current date and time. Accepts an optional `format` parameter with the following tokens:

| Token | Description | Example |
|-------|-------------|---------|
| `YYYY` | 4-digit year | `2024` |
| `MM` | 2-digit month (zero-padded) | `01`–`12` |
| `DD` | 2-digit day (zero-padded) | `01`–`31` |
| `HH` | 2-digit hour, 24h (zero-padded) | `00`–`23` |
| `mm` | 2-digit minute (zero-padded) | `00`–`59` |
| `ss` | 2-digit second (zero-padded) | `00`–`59` |

Tokens are replaced from longest to shortest to avoid partial matches (e.g. `MM` is replaced before `M` could match inside `MM`).

```handlebars
{{currentDate}}
```
**Output:** `2024-01-15` (default format `YYYY-MM-DD`)

```handlebars
{{currentDate format="DD.MM.YYYY"}}
```
**Output:** `15.01.2024`

```handlebars
{{currentDate format="YYYY-MM-DD HH:mm"}}
```
**Output:** `2024-01-15 14:30`

```handlebars
created: "[[{{currentDate}}]]"
```
**Output:** `created: "[[2024-01-15]]"` — creates a backlink to your Daily Note.

---

## Author Helpers

Work with the `entry.author` array — a list of CSL Name objects containing `family` (last name), `given` (first name), and `literal` (display name) fields.

### `formatNames`

Format an author list with configurable maximum count, "et al." suffix, and connector word. The name is resolved in priority order: `literal` > `family` > `given`.

**Parameters** (passed as hash arguments):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max` | `2` | Maximum number of authors to show before truncating with "et al." |
| `etAl` | `" et al."` | Suffix appended when authors exceed `max` |
| `connector` | `" and "` | Word joining the last two authors |

**Single author:**
```handlebars
{{formatNames entry.author}}
```
**Input:** `[{family: "Smith"}]`
**Output:** `Smith`

**Two authors — both shown, joined by connector:**
```handlebars
{{formatNames entry.author}}
```
**Input:** `[{family: "Smith"}, {family: "Jones"}]`
**Output:** `Smith and Jones`

**Three authors — exceeds default max=2, shows first + et al.:**
```handlebars
{{formatNames entry.author}}
```
**Input:** `[{family: "Smith"}, {family: "Jones"}, {family: "Lee"}]`
**Output:** `Smith et al.`

**Increase max to show all three:**
```handlebars
{{formatNames entry.author max=3}}
```
**Output:** `Smith, Jones, and Lee`

**Custom et al. text:**
```handlebars
{{formatNames entry.author max=1 etAl=" and others"}}
```
**Output:** `Smith and others`

**Custom connector (semicolons instead of "and"):**
```handlebars
{{formatNames entry.author max=10 connector="; "}}
```
**Input:** `[{family: "Smith"}, {family: "Jones"}]`
**Output:** `Smith; Jones`

### `join`

Join an array into a single string with a separator. Works with any array — keywords, authors, tags.

```handlebars
{{join keywords ", "}}
```

**Input:** `keywords: ["machine learning", "AI", "deep learning"]`
**Output:** `machine learning, AI, deep learning`

```handlebars
{{join keywords " | "}}
```

**Output:** `machine learning | AI | deep learning`

If the value is not an array, it is returned unchanged.

### `split`

Split a string into an array by a separator character. Commonly combined with `join` to reformat delimited strings, or with `{{#each}}` to iterate.

```handlebars
{{join (split "a-b-c" "-") ", "}}
```
**Output:** `a, b, c`

```handlebars
{{! Convert comma-separated keywords to YAML tags: }}
{{#each (split (join entry.data.fields.keywords ",") ",")}}
  - {{replace (truncate this 30) " " "-"}}
{{/each}}
```

**Input:** `keywords: "machine learning, neural networks"`
**Output:**
```
  - machine-learning
  - neural-networks
```

If the value is not a string, it is returned unchanged.

---

## Path Helpers

Manipulate file paths — useful for constructing PDF links or extracting filenames from bibliography `file` fields.

### `urlEncode`

URL-encode a string using JavaScript's `encodeURI()`. Escapes spaces, special characters, and non-ASCII characters so the value is safe for use in URLs.

```handlebars
[Open PDF](file://{{urlEncode entry.data.fields.file}})
```

**Input:** `file: "/home/user/My Library/Smith 2023.pdf"`
**Output:** `[Open PDF](file:///home/user/My%20Library/Smith%202023.pdf)`

If the value is not a string, it is returned unchanged.

### `basename`

Extract the filename (with extension) from a file path. Works with both forward slashes and backslashes.

```handlebars
{{basename "/home/user/papers/smith2023.pdf"}}
```
**Output:** `smith2023.pdf`

```handlebars
{{basename "C:\\Users\\me\\papers\\smith2023.pdf"}}
```
**Output:** `smith2023.pdf`

### `filename`

Extract the filename **without extension** from a file path.

```handlebars
{{filename "/home/user/papers/smith2023.pdf"}}
```
**Output:** `smith2023`

Useful for creating wiki-links from file paths:
```handlebars
[[{{filename entry.data.fields.file}}]]
```
**Output:** `[[smith2023]]`

### `dirname`

Extract the directory path from a file path (everything before the last separator).

```handlebars
{{dirname "/home/user/papers/smith2023.pdf"}}
```
**Output:** `/home/user/papers`

### `pdfLink`

Generate a `file://` URI pointing to the first PDF attachment of a reference. Returns an empty string when no PDF is available. Spaces and special characters are URL-encoded.

```handlebars
{{pdfLink entry.files}}
```

**Input:** `files: ["/home/user/papers/Smith 2023.pdf"]`
**Output:** `file:///home/user/papers/Smith%202023.pdf`

Combine with Markdown link syntax for a clickable link:

```handlebars
[Open PDF]({{pdfLink entry.files}})
```

**Output:** `[Open PDF](file:///home/user/papers/Smith%202023.pdf)`

### `pdfMarkdownLink`

Generate a complete Markdown link to the first PDF attachment. The link text is the filename without extension. Returns an empty string when no PDF is available.

```handlebars
{{pdfMarkdownLink entry.files}}
```

**Input:** `files: ["/home/user/papers/smith2023.pdf"]`
**Output:** `[smith2023](file:///home/user/papers/smith2023.pdf)`

### `zoteroPdfURI`

Generate a `zotero://open-pdf` URI for the **first** PDF attachment. Extracts the Zotero storage key from the file path (the `/storage/<KEY>/` segment). Returns an empty string when no PDF is found, the file list is empty, or the path has no Zotero storage key.

```handlebars
{{zoteroPdfURI entry.files}}
```

**Input:** `files: ["C:/Users/me/Zotero/storage/EBAUJBLY/paper.pdf"]`
**Output:** `zotero://open-pdf/library/items/EBAUJBLY`

Use with a conditional to avoid empty links when no PDF is attached:

```handlebars
{{#if (zoteroPdfURI entry.files)}}
[Open PDF in Zotero]({{zoteroPdfURI entry.files}})
{{/if}}
```

### `zoteroPdfURIs`

Generate `zotero://open-pdf` URIs for **all** PDF attachments as an **array**. Non-PDF attachments (HTML snapshots, images, etc.) are skipped. Returns an empty array when no valid PDFs are found.

Use with `{{#each}}` to iterate over the URIs:

```handlebars
{{#each (zoteroPdfURIs entry.files)}}
- [PDF]({{this}})
{{/each}}
```

**Input:**
```
files: [
  "C:/Users/me/Zotero/storage/EBAUJBLY/paper.pdf",
  "C:/Users/me/Zotero/storage/HTML1234/snapshot.html",
  "C:/Users/me/Zotero/storage/N6LQL4XL/supplement.pdf"
]
```

**Expected output:**
```markdown
- [PDF](zotero://open-pdf/library/items/EBAUJBLY)
- [PDF](zotero://open-pdf/library/items/N6LQL4XL)
```

Wrap in `{{#if}}` to render the section only when PDFs exist:

```handlebars
{{#if (zoteroPdfURIs entry.files)}}
**PDFs:**
{{#each (zoteroPdfURIs entry.files)}}
- [PDF]({{this}})
{{/each}}
{{/if}}
```

> **Note:** Both `zoteroPdfURI` and `zoteroPdfURIs` require that the file paths contain a Zotero storage path segment (`/storage/<KEY>/`). This is the case for BibLaTeX exports from Better BibTeX. CSL-JSON and Hayagriva formats typically do not include file attachment paths, so these helpers will return empty strings for those formats.

---

## Quick Reference

| Category | Helper | Purpose |
|----------|--------|---------|
| Comparison | `eq`, `ne` | Equality / inequality |
| Comparison | `gt`, `lt`, `gte`, `lte` | Numeric comparisons |
| Boolean | `and`, `or`, `not` | Combine / invert conditions |
| String | `replace` | Regex find & replace |
| String | `truncate` | Limit string length |
| String | `match` | Extract regex match |
| String | `quote` | JSON-stringify for safe YAML |
| Date | `currentDate` | Current date/time with format |
| Author | `formatNames` | Author list with et al. |
| Author | `join` | Array to string |
| Author | `split` | String to array |
| Path | `urlEncode` | URL-encode for links |
| Path | `basename` | Filename with extension |
| Path | `filename` | Filename without extension |
| Path | `dirname` | Directory path |
| Path     | `pdfLink`         | `file://` URI to first PDF               |
| Path     | `pdfMarkdownLink` | Markdown link to first PDF               |
| Zotero   | `zoteroPdfURI`    | `zotero://open-pdf` URI for first PDF    |
| Zotero   | `zoteroPdfURIs`   | `zotero://open-pdf` URI array for all PDFs |
