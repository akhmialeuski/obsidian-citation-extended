# Template Helpers Documentation

This document provides detailed information and examples for the Handlebars helpers available in the Obsidian Citation Extended plugin.

## Comparison Helpers

These helpers allow you to compare values within your templates, typically used inside `{{#if}}` blocks.

| Helper | Description | Example |
| :--- | :--- | :--- |
| `eq` | Equal to | `{{#if (eq type "book")}}Is a Book{{/if}}` |
| `ne` | Not equal to | `{{#if (ne type "article")}}Not an Article{{/if}}` |
| `gt` | Greater than | `{{#if (gt year 2000)}}Published after 2000{{/if}}` |
| `lt` | Less than | `{{#if (lt year 2000)}}Published before 2000{{/if}}` |
| `gte` | Greater than or equal to | `{{#if (gte year 2000)}}Published in or after 2000{{/if}}` |
| `lte` | Less than or equal to | `{{#if (lte year 2000)}}Published in or before 2000{{/if}}` |

## Boolean Helpers

These helpers allow you to combine multiple conditions.

| Helper | Description | Example |
| :--- | :--- | :--- |
| `and` | Logical AND. Returns true if all arguments are truthy. | `{{#if (and (eq type "book") (gt year 2000))}}Modern Book{{/if}}` |
| `or` | Logical OR. Returns true if any argument is truthy. | `{{#if (or (eq type "book") (eq type "thesis"))}}Book or Thesis{{/if}}` |
| `not` | Logical NOT. Inverts the boolean value. | `{{#if (not (eq type "article"))}}Not an Article{{/if}}` |

## String Helpers

These helpers allow you to manipulate strings.

### `replace`

Replaces all occurrences of a pattern in a string with a replacement string.

**Syntax:** `{{replace value pattern replacement}}`

**Parameters:**
- `value`: The input string.
- `pattern`: The regex pattern to search for (as a string).
- `replacement`: The string to replace matches with.

**Example:**
Replace colons in the title with dashes:
```handlebars
{{replace title ":" "-"}}
```

### `truncate`

Truncates a string to a specified length.

**Syntax:** `{{truncate value length}}`

**Parameters:**
- `value`: The input string.
- `length`: The maximum length of the string.

**Example:**
Truncate title to 50 characters:
```handlebars
{{truncate title 50}}
```

## Regex Helpers

### `match`

Extracts the first substring matching a regex pattern.

**Syntax:** `{{match value pattern}}`

**Parameters:**
- `value`: The input string.
- `pattern`: The regex pattern to match (as a string).

**Example:**
Extract the year from a string:
```handlebars
{{match date "\d{4}"}}
```

## Advanced Examples

### Conditional Content based on Type

```handlebars
{{#if (eq type "book")}}
# Book: {{title}}
{{else}}
# Article: {{title}}
{{/if}}
```

### Formatting Authors

Iterate over authors and format them:

```handlebars
{{#each entry.author}}
- {{this.given}} {{this.family}}
{{/each}}
```

### Complex Logic

Check if it's a recent book or a specific author:

```handlebars
{{#if (or (and (eq type "book") (gte year 2020)) (eq authorString "Smith"))}}
Priority Reading
{{/if}}
```
