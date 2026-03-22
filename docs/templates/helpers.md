# Template Helpers

Helpers extend Handlebars with custom logic. Use them inside `{{...}}` blocks.

## Comparison Helpers

Used inside `{{#if}}` blocks to compare values.

| Helper | Syntax | Example |
|--------|--------|---------|
| `eq` | `(eq a b)` | `{{#if (eq type "book")}}Book{{/if}}` |
| `ne` | `(ne a b)` | `{{#if (ne type "article")}}Not article{{/if}}` |
| `gt` | `(gt a b)` | `{{#if (gt year 2000)}}Modern{{/if}}` |
| `lt` | `(lt a b)` | `{{#if (lt year 1990)}}Classic{{/if}}` |
| `gte` | `(gte a b)` | `{{#if (gte year 2020)}}Recent{{/if}}` |
| `lte` | `(lte a b)` | `{{#if (lte year 1999)}}20th century{{/if}}` |

## Boolean Helpers

Combine multiple conditions.

| Helper | Syntax | Example |
|--------|--------|---------|
| `and` | `(and a b)` | `{{#if (and (eq type "book") (gt year 2000))}}Modern book{{/if}}` |
| `or` | `(or a b)` | `{{#if (or (eq type "book") (eq type "thesis"))}}Book or thesis{{/if}}` |
| `not` | `(not a)` | `{{#if (not (eq type "article"))}}Not article{{/if}}` |

## String Helpers

### `replace`

Replace all matches of a regex pattern.

```handlebars
{{replace title ":" "-"}}
{{replace authorString "," " and"}}
```

### `truncate`

Limit string length.

```handlebars
{{truncate title 50}}
{{truncate abstract 200}}
```

### `match`

Extract first regex match from a string.

```handlebars
{{match date "\d{4}"}}
```

### `quote`

JSON-stringify a value (safe for YAML frontmatter).

```handlebars
title: {{quote title}}
```

Output: `title: "The Art of Code"` (with escaped quotes if needed).

## Date Helpers

### `currentDate`

Insert current date with optional format.

```handlebars
{{currentDate}}                         → 2024-01-15
{{currentDate format="DD.MM.YYYY"}}     → 15.01.2024
{{currentDate format="YYYY-MM-DD HH:mm"}} → 2024-01-15 14:30
```

Tokens: `YYYY` (year), `MM` (month, zero-padded), `DD` (day), `HH` (hour), `mm` (minute), `ss` (second).

## Author Helpers

### `formatNames`

Format author list with "et al." support.

```handlebars
{{formatNames entry.author}}
→ Smith and Jones
→ Smith et al.

{{formatNames entry.author max=3}}
→ Smith, Jones, and Lee
→ Smith, Jones, and Lee et al.

{{formatNames entry.author max=1 etAl=" and others"}}
→ Smith and others

{{formatNames entry.author connector="; "}}
→ Smith; Jones
```

Parameters:
- `max` (default: 2) — maximum authors before "et al."
- `etAl` (default: " et al.") — suffix text
- `connector` (default: " and ") — connector between last two authors

### `join`

Join array elements with a separator.

```handlebars
{{join keywords ", "}}
→ machine learning, AI, deep learning
```

### `split`

Split string into array (combine with `join`).

```handlebars
{{join (split "a-b-c" "-") ", "}}
→ a, b, c
```

## Path Helpers

### `urlEncode`

URL-encode a string.

```handlebars
[Open PDF](file://{{urlEncode entry.data.fields.file}})
```

### `basename`

Get filename from path.

```handlebars
{{basename "/path/to/file.pdf"}} → file.pdf
```

### `filename`

Get filename without extension.

```handlebars
{{filename "/path/to/file.pdf"}} → file
```

### `dirname`

Get directory from path.

```handlebars
{{dirname "/path/to/file.pdf"}} → /path/to
```

## Combining Helpers

Helpers can be nested using parentheses:

```handlebars
{{#if (and (eq type "book") (gt year 2020))}}
  Modern book by {{formatNames entry.author max=3}}
{{else}}
  {{truncate title 40}} ({{year}})
{{/if}}
```
