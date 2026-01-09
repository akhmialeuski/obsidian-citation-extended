# Template Variables & Advanced Usage

The Citations plugin allows you to customize your literature notes and citations using a powerful templating system based on [Handlebars](https://handlebarsjs.com/).

## Standard Variables

These variables are available for every entry (if the data exists in your library).

| Variable | Description | Example |
| :--- | :--- | :--- |
| `{{citekey}}` | Unique identifier for the reference | `smith2020` |
| `{{title}}` | Full title of the reference | `The Art of Code` |
| `{{titleShort}}` | Short title | `Art of Code` |
| `{{authorString}}` | Comma-separated list of authors | `John Smith, Jane Doe` |
| `{{year}}` | Publication year | `2020` |
| `{{containerTitle}}` | Journal or Book title | `Journal of Computer Science` |
| `{{series}}` | Series name | `Lecture Notes in CS` |
| `{{volume}}` | Volume number | `42` |
| `{{publisher}}` | Publisher name | `Oxford University Press` |
| `{{publisherPlace}}` | Location of publisher | `Oxford` |
| `{{page}}` | Page range | `10-25` |
| `{{DOI}}` | Digital Object Identifier | `10.1234/5678` |
| `{{URL}}` | URL link | `https://example.com` |
| `{{abstract}}` | Abstract or summary | `This paper discusses...` |
| `{{zoteroSelectURI}}` | URI to select item in Zotero | `zotero://select/items/...` |
| `{{type}}` | Reference type | `article-journal` |
| `{{date}}` | Publication Date (YYYY-MM-DD) | `2020-01-15` |

## Advanced Access: `entry.data.fields`

If you need to access fields that are not covered by the standard variables (e.g., custom fields, specific BibTeX properties like `keywords`, `file` paths, or `origdate`), you can access the raw entry data.

The `entry` object represents the full internal data structure.

### `entry.data.fields`

Contains the raw fields from your source database (BibLaTeX or CSL-JSON).

**Usage Syntax:**
`{{entry.data.fields.FIELD_NAME}}`

**Note:** Field names are case-sensitive and often lowercase (especially for BibLaTeX).

### Examples

#### 1. Accessing Keywords
BibTeX often stores keywords in a `keywords` field.
```handlebars
**Keywords:** {{entry.data.fields.keywords}}
```
*If keywords is an array, you might need to join it:*
```handlebars
**Keywords:** {{join entry.data.fields.keywords ", "}}
```

#### 2. Accessing File Paths
To get the path to the attached PDF:
```handlebars
[Open PDF](file://{{urlEncode entry.data.fields.file}})
```
*Note: We use `urlEncode` to handle spaces in file paths.*

#### 3. Accessing Custom Fields
If you added a custom field `myCustomField` in Zotero/BibTeX:
```handlebars
**My Note:** {{entry.data.fields.mycustomfield}}
```
*(Check your .bib file for the exact field name casing).*

#### 4. Accessing Raw Arrays
Some fields like `author` or `file` are parsed as arrays.
To access the first file specifically:
```handlebars
{{entry.data.fields.file.[0]}}
```

#### 5. Debugging
To see what fields are available, you can print the entire object (for debugging purposes):
```handlebars
{{quote entry.data.fields}}
```

## Template Helpers

Helpers allow you to perform logic and formatting within your templates.

[See Template Helpers Documentation](template-helpers.md) for a full list of available helpers like `eq`, `if`, `replace`, `formatNames`, and path helpers.
