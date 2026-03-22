# Template Variables

The plugin uses [Handlebars](https://handlebarsjs.com/) for templating. Variables are wrapped in `{{double braces}}`. A variable renders as empty text if the value is absent in the bibliography entry — it does not produce an error.

---

## Standard Variables

These shortcuts are mapped from each bibliography entry at render time. Every entry has `citekey`, `type`, and `title`; the rest depend on what your reference manager exports.

| Variable | Description | Example |
|----------|-------------|---------|
| `{{citekey}}` | Unique identifier (same as `entry.id`) | `smith2020` |
| `{{title}}` | Full title | `The Art of Code` |
| `{{titleShort}}` | Abbreviated title (if available) | `Art of Code` |
| `{{authorString}}` | Comma-separated author names | `John Smith, Jane Doe` |
| `{{lastname}}` | Family name of the **first** author | `Smith` |
| `{{year}}` | Publication year (as string) | `2020` |
| `{{date}}` | Publication date formatted as `YYYY-MM-DD` | `2020-01-15` |
| `{{type}}` | CSL reference type | `article-journal` |
| `{{containerTitle}}` | Journal, book, or series title | `Journal of Computer Science` |
| `{{series}}` | Series name | `Lecture Notes in CS` |
| `{{volume}}` | Volume number | `42` |
| `{{page}}` | Page or page range | `10-25` |
| `{{publisher}}` | Publisher name | `Oxford University Press` |
| `{{publisherPlace}}` | Publisher location | `Oxford` |
| `{{DOI}}` | Digital Object Identifier | `10.1234/5678` |
| `{{URL}}` | Web link | `https://example.com` |
| `{{ISBN}}` | International Standard Book Number | `978-3-16-148410-0` |
| `{{abstract}}` | Summary / abstract text | `This paper discusses...` |
| `{{language}}` | Language code | `en` |
| `{{source}}` | Source of the reference (e.g. the database software) | `Zotero` |
| `{{eventPlace}}` | Location of an event (conference, etc.) | `New York` |
| `{{eprint}}` | E-print identifier (BibLaTeX only) | `2001.12345` |
| `{{eprinttype}}` | E-print service (BibLaTeX only) | `arxiv` |
| `{{keywords}}` | Keywords array — use `{{join keywords ", "}}` to render | `["machine learning", "AI"]` |
| `{{note}}` | Notes from reference manager (HTML decoded, links converted to Markdown) | `Important paper` |
| `{{zoteroSelectURI}}` | URI to open the reference in Zotero client | `zotero://select/items/@smith2020` |
| `{{zoteroId}}` | Zotero internal item key (from `zotero-key` BibLaTeX field) | `ABC12345` |
| `{{selectedText}}` | Text selected in the editor when the command was invoked | `as shown by` |

### Special Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{currentDate}}` | Current date at note creation time (helper, not entry data) | `2024-01-15` |
| `{{currentDate format="DD.MM.YYYY"}}` | Current date with custom format | `15.01.2024` |

See [Helpers: currentDate](helpers.md#currentdate) for all format tokens.

---

## Accessing Raw Entry Data (Custom Fields)

Standard variables cover the most common fields, but your bibliography file may contain additional data — PDF paths, custom annotations, BibLaTeX-specific fields, or any field your reference manager exports. You can access **all** raw data through the `entry` object.

### How it works

When you use `{{citekey}}` or `{{title}}`, you're accessing a shortcut. Behind the scenes, the template context looks like this:

```
{
  citekey: "smith2020",        ← shortcut
  title: "The Art of Code",    ← shortcut
  ...
  entry: {                     ← full raw entry object
    id: "smith2020",
    type: "article-journal",
    title: "The Art of Code",
    data: { ... }              ← raw parser output
  }
}
```

The `entry` object is the internal representation of your reference serialized via `toJSON()`. It includes all public properties AND all getters (citekey, year, note, zoteroSelectURI). The `entry.data` sub-object contains the **raw output from the bibliography parser** — this is where custom fields live.

### BibLaTeX (`.bib`) — Accessing Custom Fields

For BibLaTeX files, raw fields are stored in `entry.data.fields`:

```handlebars
{{entry.data.fields.FIELD_NAME}}
```

**Field names match your `.bib` file exactly** (lowercase). Open your `.bib` file in a text editor and look for the field names between the `{ }` braces:

```bibtex
@article{smith2020,
  title = {The Art of Code},
  author = {John Smith},
  journal = {Nature},
  year = {2020},
  file = {/home/user/papers/smith2020.pdf},
  annotation = {Great paper about coding patterns},
  mycustomfield = {some custom value},
  keywords = {machine learning, AI},
  langid = {english}
}
```

Each of these fields is accessible in templates:

```handlebars
{{! PDF file link }}
[Open PDF](file://{{urlEncode entry.data.fields.file}})

{{! Custom annotation field }}
{{entry.data.fields.annotation}}

{{! Any custom field you added in your reference manager }}
{{entry.data.fields.mycustomfield}}

{{! Language ID (BibLaTeX-specific, different from {{language}}) }}
{{entry.data.fields.langid}}
```

**Important:** Many BibLaTeX fields are arrays internally (the parser wraps values in arrays). The standard variables like `{{title}}` extract the first element automatically. When accessing `entry.data.fields.*` directly, use `.[0]` to get the first element if you get `[object Object]` instead of a string:

```handlebars
{{! If entry.data.fields.file is an array: }}
{{entry.data.fields.file.[0]}}
```

**Common BibLaTeX raw fields** not available as standard variables:

| Raw field path | Description |
|----------------|-------------|
| `entry.data.fields.file` | Path to attached PDF(s) |
| `entry.data.fields.annotation` | Zotero annotations / notes |
| `entry.data.fields.langid` | Language identifier |
| `entry.data.fields.primaryclass` | arXiv primary class |
| `entry.data.fields.origdate` | Original publication date |
| `entry.data.fields.urldate` | Date URL was accessed |
| `entry.data.fields.shorttitle` | Short title |
| `entry.data.fields.addendum` | Additional information |
| `entry.data.fields.howpublished` | How the work was published |
| `entry.data.creators.editor` | Editor names (array of `{firstName, lastName}`) |

### CSL-JSON (`.json`) — Accessing Custom Fields

For CSL-JSON files, raw data is stored directly in `entry.data`:

```handlebars
{{entry.data.FIELD_NAME}}
```

CSL-JSON uses **hyphenated field names** as defined in the [CSL specification](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html). Open your `.json` file to see the exact structure:

```json
{
  "id": "smith2020",
  "type": "article-journal",
  "title": "The Art of Code",
  "container-title": "Nature",
  "issued": { "date-parts": [[2020, 1, 15]] },
  "custom-field": "some value"
}
```

```handlebars
{{! Container title via raw CSL data }}
{{entry.data.container-title}}

{{! Issued date parts (raw) }}
{{entry.data.issued.date-parts}}

{{! Any custom field in your JSON }}
{{entry.data.custom-field}}
```

**Note:** Hyphenated field names work in Handlebars as-is — no special syntax needed.

### Discovering Available Fields

If you're unsure what fields your bibliography contains, use the `quote` helper to dump the raw data:

**See all standard entry properties:**
```handlebars
{{quote entry}}
```

**See all raw parser fields (BibLaTeX):**
```handlebars
{{quote entry.data.fields}}
```

**See the full raw parser output:**
```handlebars
{{quote entry.data}}
```

This renders the entire object as JSON in your note. Create a temporary literature note with one of these templates, open it, and inspect the JSON to find the exact field names available in your data.

---

## Dynamic Variables

The plugin automatically exposes **every key** from your entry as a template variable — not just the standard shortcuts listed above. This means custom fields, format-specific properties, and any data your reference manager exports are available without needing the `entry.data.fields.*` path.

### How Dynamic Variables Work

When rendering a template, the plugin calls `entry.toJSON()` and merges the result with the standard shortcuts. This means:

1. **Standard shortcuts** (`citekey`, `title`, `year`, etc.) are always available
2. **Every public property** on the entry class is also available via `entry.*`
3. **Getter values** like `zoteroSelectURI`, `note`, `year`, `citekey` are included too

### When Dynamic Variables Are Useful

Dynamic variables appear when the bibliography parser produces properties not covered by the standard shortcuts. This happens most often with:

- **CSL-JSON entries** — CSL has many standard fields (`annote`, `archive`, `archive-location`, `authority`, `call-number`, `citation-label`, `collection-title`, `dimensions`, `genre`, `jurisdiction`, `medium`, `number`, `original-title`, `PMID`, `PMCID`, `references`, `reviewed-title`, `scale`, `section`, `status`, `version`) that are exposed as dynamic variables
- **BibLaTeX entries with custom fields** — any field in your `.bib` file that maps to an entry property
- **Entries with non-standard properties** added by specific reference managers

### Example: Using Dynamic Variables

If your CSL-JSON entries contain a `number` field:

```handlebars
{{! Directly as a variable (if it's a top-level property): }}
Issue: {{number}}

{{! Or via the entry object (always works): }}
Issue: {{entry.number}}
```

### Introspection: Seeing All Available Variables

The plugin includes an **IntrospectionService** that discovers all available variables by sampling your library. The settings documentation links show the full list of known variables with descriptions and examples from your actual data.

To see all variables programmatically (for developers), the `IntrospectionService.getTemplateVariables(library)` method returns `VariableDefinition[]` with `key`, `description`, and `example` for every discovered variable.

### Fallback Priority

When a variable name exists both as a standard shortcut and as a dynamic variable, the **standard shortcut wins**. For example, `{{title}}` always uses the shortcut value (from `entry.title`), not a raw parser field.

---

## The `entry` Object

The `{{entry}}` variable contains the full internal representation of the reference, serialized via `toJSON()`. It includes:

- All public properties (`id`, `type`, `title`, `author`, `abstract`, etc.)
- All getters (`citekey`, `year`, `note`, `zoteroSelectURI`, `authorString`)
- The `data` sub-object with raw parser output

Use `{{quote entry}}` to inspect the full structure of any entry. This is the most reliable way to discover what data is available for your specific bibliography format and reference manager.

```handlebars
{{! Access nested properties: }}
First author family name: {{entry.author.[0].family}}
First author given name: {{entry.author.[0].given}}
All authors as JSON: {{quote entry.author}}
```

### `entry.author` Array

The `entry.author` field is an array of objects with these properties:

| Property | Description | Example |
|----------|-------------|---------|
| `family` | Last name / family name | `Smith` |
| `given` | First name / given name | `John` |
| `literal` | Display name (when family/given are not separate) | `World Health Organization` |

Use with `formatNames` helper or iterate with `{{#each entry.author}}`:

```handlebars
{{#each entry.author}}
- {{this.given}} {{this.family}}
{{/each}}
```

**Output:**
```
- John Smith
- Jane Doe
```
