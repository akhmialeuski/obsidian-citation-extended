# Linking Literature Notes

## Problem

You are writing a synthesis note, a project overview, or a daily journal and want to reference a specific literature note inline. Instead of manually typing the file path or searching for it in the file explorer, you want to quickly insert a properly formatted link — either a wiki link (`[[path]]`) or a Markdown link (`[text](path)`) — with an appropriate display name.

This is different from inserting a citation (`[@citekey]`). A literature note link creates a navigable connection within your vault, whereas a citation is a formatted text string for eventual export to PDF or DOCX.

## Prerequisites

- At least one citation database configured and loaded
- Literature notes folder configured in **Settings > Citation plugin > Literature Notes**
- (Optional) A hotkey assigned to **Citations: Insert literature note link** — recommended: `Ctrl+Shift+L`

## Step-by-Step Walkthrough

### Inserting a Wiki Link

1. Make sure your vault is set to use wiki links: **Settings > Files and links > Use `[[Wikilinks]]`** is enabled (this is the Obsidian default).

2. Place your cursor where you want the link:

   ```markdown
   For the theoretical foundation, see |
   ```

3. Open the Command Palette (`Ctrl+P`) and run **Citations: Insert literature note link** (or press your configured hotkey, e.g. `Ctrl+Shift+L`).

4. The search modal opens. Type `lecun deep` to find the reference:

   ```
   Deep learning
   LeCun, Bengio, Hinton (2015)
   lecun2015
   ```

5. Press `Enter` to select it.

6. A wiki link is inserted using the note's title as display text:

   ```markdown
   For the theoretical foundation, see [[Reading notes/@lecun2015]]
   ```

7. If the literature note does not exist yet, it is created automatically (unless you have disabled automatic note creation in settings).

### Inserting a Markdown Link

1. If your vault uses Markdown links: **Settings > Files and links > Use `[[Wikilinks]]`** is disabled.

2. Follow the same steps as above. The inserted link uses Markdown syntax with the citekey as display text:

   ```markdown
   For the theoretical foundation, see [lecun2015](Reading notes/@lecun2015.md)
   ```

   The citekey is used as display text for Markdown links because it preserves special characters (colons, slashes) that would be stripped from filenames.

### Using a Custom Display Template

1. Go to **Settings > Citation plugin > Markdown Citations > Literature note link display template**.

2. Enter a Handlebars template. For example:

   ```handlebars
   {{authorString}} ({{year}})
   ```

3. Now, when you insert a link, the display text uses your template instead of the default.

4. **Wiki link result:**

   ```markdown
   [[Reading notes/@lecun2015|LeCun, Bengio, Hinton (2015)]]
   ```

5. **Markdown link result:**

   ```markdown
   [LeCun, Bengio, Hinton (2015)](Reading notes/@lecun2015.md)
   ```

## Template Setup

The display text template is configured in **Settings > Citation plugin > Markdown Citations > Literature note link display template**. This is a single-line Handlebars template with access to all entry variables.

### Common Display Templates

| Template | Wiki link result | Markdown link result |
|----------|-----------------|---------------------|
| (empty — default) | `[[Reading notes/@lecun2015]]` | `[lecun2015](Reading notes/@lecun2015.md)` |
| `{{authorString}} ({{year}})` | `[[Reading notes/@lecun2015\|LeCun, Bengio, Hinton (2015)]]` | `[LeCun, Bengio, Hinton (2015)](Reading notes/@lecun2015.md)` |
| `{{titleShort}}` | `[[Reading notes/@lecun2015\|Deep learning]]` | `[Deep learning](Reading notes/@lecun2015.md)` |
| `@{{citekey}}` | `[[Reading notes/@lecun2015\|@lecun2015]]` | `[@lecun2015](Reading notes/@lecun2015.md)` |
| `{{formatNames entry.author max=1}}, {{year}}` | `[[Reading notes/@lecun2015\|LeCun et al., 2015]]` | `[LeCun et al., 2015](Reading notes/@lecun2015.md)` |

## Expected Result

Given an entry:

```json
{
  "id": "hinton2012",
  "type": "paper-conference",
  "title": "ImageNet Classification with Deep Convolutional Neural Networks",
  "author": [
    {"family": "Krizhevsky", "given": "Alex"},
    {"family": "Sutskever", "given": "Ilya"},
    {"family": "Hinton", "given": "Geoffrey"}
  ],
  "issued": {"date-parts": [[2012]]}
}
```

**Default wiki link:**

```markdown
[[Reading notes/@hinton2012]]
```

**Default Markdown link:**

```markdown
[hinton2012](Reading notes/@hinton2012.md)
```

**With display template `{{formatNames entry.author max=2}} ({{year}})`:**

Wiki link:

```markdown
[[Reading notes/@hinton2012|Krizhevsky and Sutskever et al. (2012)]]
```

Markdown link:

```markdown
[Krizhevsky and Sutskever et al. (2012)](Reading notes/@hinton2012.md)
```

## Variations

### Link Without Auto-Creating the Note

If you want to insert links only to notes that already exist:

1. Go to **Settings > Citation plugin > Literature Notes**
2. Enable **Disable automatic note creation**
3. Now, inserting a link for a reference without an existing note shows an error message

### Inline Citation Link

Set the display template to create citation-style links that are also navigable:

```handlebars
@{{citekey}}
```

Result:

```markdown
[[Reading notes/@lecun2015|@lecun2015]]
```

This looks like a citation in reading mode but functions as a clickable link to the literature note.

### Link with Title and Year

```handlebars
{{titleShort}} ({{year}})
```

Result:

```markdown
[[Reading notes/@lecun2015|Deep learning (2015)]]
```

This is more readable in prose than a bare citekey.

## Tips

- **Wiki links vs. Markdown links** is a vault-level setting in Obsidian, not a plugin setting. The plugin respects whatever you have configured.
- **The display template affects both link types.** You do not need separate templates for wiki and Markdown links.
- **Links work with subfolder organization.** If your title template is `{{type}}/{{citekey}}`, the link path reflects the subfolder structure: `[[Reading notes/article-journal/@lecun2015]]`.
- **Difference from "Insert Markdown citation":** The citation command inserts formatted text like `[@lecun2015]`. The link command inserts a navigable vault link like `[[Reading notes/@lecun2015]]`. Use citations for export-ready documents and links for internal knowledge graphs.
- **Auto-creation happens silently.** When a literature note is created via the link command, it happens in the background — the note file is created but not opened. You stay in your current document.
