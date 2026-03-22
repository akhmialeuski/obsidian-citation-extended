# Template Variables

The plugin uses [Handlebars](https://handlebarsjs.com/) for templating. Variables are wrapped in `{{double braces}}`.

## Standard Variables

Available for every entry (when the data exists in your bibliography file):

| Variable | Description | Example |
|----------|-------------|---------|
| `{{citekey}}` | Unique identifier | `smith2020` |
| `{{title}}` | Full title | `The Art of Code` |
| `{{titleShort}}` | Abbreviated title | `Art of Code` |
| `{{authorString}}` | Comma-separated authors | `John Smith, Jane Doe` |
| `{{year}}` | Publication year | `2020` |
| `{{date}}` | Publication date (YYYY-MM-DD) | `2020-01-15` |
| `{{containerTitle}}` | Journal or book title | `Journal of Computer Science` |
| `{{series}}` | Series name | `Lecture Notes in CS` |
| `{{volume}}` | Volume number | `42` |
| `{{page}}` | Page range | `10-25` |
| `{{publisher}}` | Publisher name | `Oxford University Press` |
| `{{publisherPlace}}` | Publisher location | `Oxford` |
| `{{DOI}}` | Digital Object Identifier | `10.1234/5678` |
| `{{URL}}` | Web link | `https://example.com` |
| `{{abstract}}` | Summary text | `This paper discusses...` |
| `{{type}}` | Reference type | `article-journal` |
| `{{language}}` | Language code | `en` |
| `{{source}}` | Source database | `Zotero` |
| `{{eventPlace}}` | Event location | `New York` |
| `{{eprint}}` | E-print identifier | `2001.12345` |
| `{{eprinttype}}` | E-print service | `arxiv` |
| `{{ISBN}}` | ISBN number | `978-3-16-148410-0` |
| `{{keywords}}` | Keywords (if array, use `join`) | `machine learning, AI` |
| `{{note}}` | Notes from reference manager | `Important paper` |
| `{{zoteroSelectURI}}` | URI to open in Zotero | `zotero://select/items/...` |
| `{{lastname}}` | First author's last name | `Smith` |
| `{{selectedText}}` | Text selected in editor when command was invoked | `as shown by` |
| `{{currentDate}}` | Today's date (note creation date) | `2024-01-15` |

## Current Date with Custom Format

The `{{currentDate}}` helper supports a custom format:

```handlebars
{{currentDate}}                        → 2024-01-15
{{currentDate format="DD.MM.YYYY"}}    → 15.01.2024
{{currentDate format="YYYY/MM/DD"}}    → 2024/01/15
```

Supported tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`.

## Accessing Raw Entry Data

For fields not covered by standard variables (custom BibTeX fields, `file` paths, `origdate`, etc.):

```handlebars
{{entry.data.fields.FIELD_NAME}}
```

Field names are case-sensitive. Check your `.bib` file for exact names.

### Examples

**Keywords (from array):**
```handlebars
{{join entry.data.fields.keywords ", "}}
```

**PDF file path:**
```handlebars
[Open PDF](file://{{urlEncode entry.data.fields.file}})
```

**Custom field:**
```handlebars
{{entry.data.fields.mycustomfield}}
```

**First file from array:**
```handlebars
{{entry.data.fields.file.[0]}}
```

**Debug — see all available fields:**
```handlebars
{{quote entry.data.fields}}
```

## The `entry` Object

The `{{entry}}` variable contains the full internal representation of the reference. Use `{{quote entry}}` to inspect its structure. This is useful for accessing nested properties not exposed as top-level variables.

## Dynamic Variables

Any key present in your entry's data is automatically exposed as a variable. The available keys depend on your bibliography file. Common dynamic variables include: `abstract`, `DOI`, `keywords`, `note`, `publisher`, `URL`, `zoteroId`.
