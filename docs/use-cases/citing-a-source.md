# Citing a Source While Writing

## Problem

You are writing an academic paper, a blog post, or a research note in Obsidian, and you need to insert a reference to a specific source. Instead of switching to your reference manager, copying a citekey, and manually typing the citation syntax, you want to search for the source by title or author and insert a properly formatted citation without leaving your editor.

This is the most frequent action you will perform with the plugin. A fast citation workflow lets you stay in your writing flow while building a properly referenced document.

## Prerequisites

- At least one citation database configured in **Settings > Citation plugin > Citation databases** with a valid file path and format (CSL-JSON, BibLaTeX, or Hayagriva)
- The status bar shows the number of loaded entries (e.g., `Citations: 342 entries`)
- (Optional) A hotkey assigned to **Citations: Insert Markdown citation** — recommended: `Ctrl+Shift+E`

## Step-by-Step Walkthrough

### Inserting a Primary Citation

1. Place your cursor where you want the citation to appear in your note. For example, after a sentence:

   ```
   Transformer models have revolutionized natural language processing|
   ```

   (The `|` represents your cursor position.)

2. Open the Command Palette (`Ctrl+P`) and search for **Citations: Insert Markdown citation** (or press your configured hotkey, e.g. `Ctrl+Shift+E`).

3. The search modal appears. Type the author name, title, or year of the source you want to cite. For example, type `vaswani attention`:

   The modal displays matching entries with title, authors, year, and citekey. You will see something like:

   ```
   Attention Is All You Need
   Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)
   vaswani2017
   ```

4. Press `Enter` to select the entry.

5. The citation is inserted at your cursor position. Your text now reads:

   ```markdown
   Transformer models have revolutionized natural language processing[@vaswani2017]
   ```

6. The cursor moves to the end of the inserted text, so you can continue typing immediately:

   ```markdown
   Transformer models have revolutionized natural language processing[@vaswani2017]. Building on this work...|
   ```

### Inserting a Secondary (Alternative) Citation

The plugin supports two citation formats: primary (Enter) and secondary (Shift+Enter). The default primary format is `[@citekey]` (Pandoc parenthetical) and the default secondary is `@citekey` (Pandoc in-text).

1. Place your cursor where you want a narrative citation:

   ```
   According to |, the self-attention mechanism...
   ```

2. Run **Citations: Insert Markdown citation** to open the search modal (via Command Palette or your configured hotkey).

3. Type `vaswani` to find the entry.

4. Press `Shift+Enter` instead of Enter.

5. The secondary citation format is inserted:

   ```markdown
   According to @vaswani2017, the self-attention mechanism...
   ```

### Auto-Creating a Literature Note on Citation

If you want every cited reference to have a corresponding literature note:

1. Go to **Settings > Citation plugin > Markdown Citations**
2. Enable **Auto-create literature note on citation**
3. Now, each time you insert a citation, the plugin also creates the literature note file (if it does not already exist) using your configured content template

## Template Setup

The citation format is controlled by two templates in **Settings > Citation plugin > Markdown Citations**.

### Default Custom Templates

```handlebars
{{! Primary citation template — Pandoc parenthetical style }}
[@{{citekey}}]

{{! Secondary citation template — Pandoc in-text style }}
@{{citekey}}
```

### Citation Style Presets

Instead of writing custom templates, you can select a preset in the **Citation style preset** dropdown:

| Preset | Primary result | Secondary result |
|--------|---------------|-----------------|
| `citekey` | `[@vaswani2017]` | `@vaswani2017` |
| `textcite` | `Vaswani, Shazeer et al. (2017)` | `[@vaswani2017]` |
| `parencite` | `(Vaswani, Shazeer et al., 2017)` | `[@vaswani2017]` |
| `custom` | Whatever you configure | Whatever you configure |

When a preset is active, the template fields are locked. Switch to `custom` to edit them freely.

## Expected Result

Given a BibLaTeX entry:

```bibtex
@article{vaswani2017,
  title  = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},
  year   = {2017},
  journal = {Advances in Neural Information Processing Systems}
}
```

**Primary citation (Enter):**

```markdown
[@vaswani2017]
```

**Secondary citation (Shift+Enter):**

```markdown
@vaswani2017
```

**With `textcite` preset — Primary (Enter):**

```markdown
Vaswani, Shazeer et al. (2017)
```

**With `parencite` preset — Primary (Enter):**

```markdown
(Vaswani, Shazeer et al., 2017)
```

## Variations

### Custom Citation Format for Obsidian Wiki Links

If you do not use Pandoc and prefer Obsidian-native links as citations, set the primary template to:

```handlebars
[[{{citekey}}]]
```

**Result:**

```markdown
[[vaswani2017]]
```

### Citation with Page Number Placeholder

To remind yourself to add page numbers, include a placeholder in the template:

```handlebars
[@{{citekey}}, p. ]
```

**Result:**

```markdown
[@vaswani2017, p. ]
```

The cursor lands at the end, so you can type the page number right away.

### APA-Style Narrative Citation

```handlebars
{{formatNames entry.author max=2}} ({{year}})
```

**Result:**

```markdown
Vaswani and Shazeer et al. (2017)
```

## Tips

- **Speed matters.** Assigning a hotkey (e.g. `Ctrl+Shift+E`) to the citation command makes it nearly instant — your fingers never leave the keyboard.
- **Primary vs. secondary is contextual.** Use primary for parenthetical citations at the end of a sentence and secondary for narrative citations woven into your prose.
- **The modal remembers nothing between invocations.** Each time you open it, the search field is empty. For inserting many citations in a row, see [Multi-Citation Workflow](multi-citation-workflow.md).
- **Cursor positioning.** After insertion, the cursor is always placed at the end of the inserted text. This means you can type a period, a space, or continue your sentence immediately.
- **If the citation looks wrong**, check your templates in settings. The most common issue is selecting a preset but expecting custom template behavior — presets lock the template fields.
