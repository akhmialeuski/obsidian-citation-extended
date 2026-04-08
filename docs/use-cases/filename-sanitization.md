# Customizing Filename Sanitization

## Problem

When creating literature notes, certain characters in titles are not allowed in filenames. By default, the plugin replaces characters like `: * ? " < > |` with an underscore (`_`). This can produce awkward filenames — for example, a reference titled "Social Networks: A Survey" becomes `Social Networks_ A Survey.md`.

You want control over what character (or no character) replaces these illegal characters, so your filenames look cleaner.

## Prerequisites

- At least one citation database configured and loaded
- Literature note creation working (the "Open literature note" command generates files)

## Step-by-Step Walkthrough

### Changing the Replacement Character

1. Open **Settings > Citation plugin > Literature Notes**.

2. Find the **Filename sanitization replacement** field (below "Disable automatic note creation").

3. Enter the character you want. Common choices:

   | Value       | Example title          | Resulting filename             |
   | ----------- | ---------------------- | ------------------------------ |
   | `_`         | `Networks: A Survey`   | `Networks_ A Survey.md`        |
   | ` ` (space) | `Networks: A Survey`   | `Networks  A Survey.md`        |
   | `-`         | `Networks: A Survey`   | `Networks- A Survey.md`        |
   | (empty)     | `Networks: A Survey`   | `Networks A Survey.md`         |

4. Click away or close settings. The setting takes effect immediately on the next note creation.

### Removing Characters Entirely

If you want colons and other special characters to simply disappear rather than be replaced, clear the field completely (empty string). A title like `"Theory: Practice"` will produce the filename `Theory Practice.md`.

### How It Works

The replacement applies in three places:

- **Note filenames** — when the "Open literature note" command generates a path from your title template
- **Subfolder path segments** — when your title template uses `/` for subdirectories (e.g. `{{type}}/{{citekey}}`), each segment is sanitized independently
- **Data values with slashes** — variable values containing `/` (e.g. `"Author A / Author B"`) are replaced before rendering to prevent accidental subdirectory creation

## Expected Output

With the default `_` replacement and a reference titled "Deep Learning: An MIT Press Book":

```
Reading notes/@goodfellow2016.md
# title: "Deep Learning_ An MIT Press Book"
```

After changing the replacement to empty string:

```
Reading notes/@goodfellow2016.md
# title: "Deep Learning An MIT Press Book"
```
