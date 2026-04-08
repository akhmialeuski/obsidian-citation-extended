# Navigating from a Citation to Its Literature Note

## Problem

While reading or editing a document, you encounter a citation like `[@vaswani2017]` and want to quickly open the corresponding literature note to review your reading notes, check the abstract, or add new annotations. Opening the search modal, typing the citekey, and selecting it each time is too many steps for a simple navigation action.

The plugin provides a direct command that reads the citation under your cursor and jumps straight to the note — no search modal, no typing.

## Prerequisites

- At least one citation database configured and loaded
- Literature notes folder configured in **Settings > Citation plugin > Literature Notes**
- (Optional) A hotkey assigned to **Citations: Open literature note for citation at cursor** — recommended: `Ctrl+Shift+G`

## Step-by-Step Walkthrough

### Jumping to a Note from a Pandoc Citation

1. You have a document with citations:

   ```markdown
   Transformer architectures [@vaswani2017] have become the foundation
   of modern NLP, with BERT [@devlin2019] and GPT [@radford2018]
   being the most influential models.
   ```

2. Place your cursor inside or next to the first citation — anywhere within `[@vaswani2017]`:

   ```markdown
   Transformer architectures [@vaswa|ni2017] have become the foundation
   ```

3. Open the Command Palette (`Ctrl+P`) and run **Citations: Open literature note for citation at cursor** (or press your configured hotkey, e.g. `Ctrl+Shift+G`).

4. The plugin parses the current line, finds the citation pattern `[@vaswani2017]`, extracts the citekey `vaswani2017`, and opens the literature note directly.

5. If the note exists at `Reading notes/@vaswani2017.md`, it opens in the editor. If it does not exist and automatic note creation is enabled, it is created from your template and opened.

### Recognized Citation Patterns

The plugin recognizes three citation patterns on the current line:

| Pattern | Example | Extracted citekey |
|---------|---------|-------------------|
| Pandoc parenthetical | `[@vaswani2017]` | `vaswani2017` |
| Pandoc in-text | `@vaswani2017` | `vaswani2017` |
| Obsidian wiki link | `[[@vaswani2017]]` | `vaswani2017` |

All three patterns work regardless of where exactly your cursor is positioned on the line, as long as the citation appears somewhere on that line.

### When No Citation Is Found

If the plugin cannot find a recognized citation pattern on the current line, nothing happens. No modal opens, no error is shown — the command silently does nothing. Make sure your cursor is on a line that contains a citation.

### Navigating in a Dense Document

1. You are reviewing a literature review section:

   ```markdown
   The field of computer vision has seen rapid progress. Early work
   on convolutional networks [@lecun1998] established the foundation.
   AlexNet [@krizhevsky2012] demonstrated the power of deep networks
   on ImageNet. Later, residual connections [@he2016] enabled training
   of very deep networks, leading to architectures like DenseNet
   [@huang2017] and EfficientNet [@tan2019].
   ```

2. To review your notes on the ResNet paper, place your cursor on the line containing `[@he2016]` and run **Citations: Open literature note for citation at cursor** (via the Command Palette or your configured hotkey, e.g. `Ctrl+Shift+G`).

3. The note `Reading notes/@he2016.md` opens. Read your notes, add new thoughts, then navigate back using Obsidian's back button (`Ctrl+Alt+Left` on Windows/Linux or `Cmd+Alt+Left` on macOS).

4. Move to another citation line and repeat.

## Expected Result

**Cursor on this line:**

```markdown
The attention mechanism [@vaswani2017] was a breakthrough.
```

**Action:** Run **Citations: Open literature note for citation at cursor** (via Command Palette or your configured hotkey, e.g. `Ctrl+Shift+G`)

**Result:** The file `Reading notes/@vaswani2017.md` opens in the editor. If the file does not exist and auto-creation is enabled, it is created with your configured template content.

## Variations

### With Wiki-Link Style Citations

If you use Obsidian wiki links as your citation format (instead of Pandoc syntax):

```markdown
The attention mechanism [[@vaswani2017]] was a breakthrough.
```

Place your cursor on this line and run the command. The plugin extracts `vaswani2017` from the `[[@vaswani2017]]` pattern and opens the note.

### With In-Text Citations

For bare `@citekey` references (common with the `textcite` preset):

```markdown
According to @vaswani2017, the self-attention mechanism...
```

The plugin recognizes the `@vaswani2017` pattern and navigates to the note.

### Combined with "Open Literature Note" Command

The two commands serve different purposes:

| Command | When to use | Modal? |
|---------|------------|--------|
| **Open literature note** (suggested: `Ctrl+Shift+O`) | You want to browse and search your library | Yes — search modal opens |
| **Open literature note for citation at cursor** (suggested: `Ctrl+Shift+G`) | You see a specific citation and want to jump to it | No — direct navigation |

Use **Open literature note for citation at cursor** for fast in-context navigation and **Open literature note** for exploratory browsing.

## Tips

- **This command is read-only navigation.** It never modifies your document — it only opens or creates the literature note file.
- **Multi-cite handling.** If your cursor is on a line with `[@lecun2015; @vaswani2017; @devlin2019]`, the plugin picks the first citekey it matches on the line. To navigate to a specific one in a multi-cite, make sure it appears first on the line or use the search-based **Open literature note** command instead.
- **Works across panes.** The note opens in the active pane. If you want it to open in a split pane, use Obsidian's native "Open in new pane" behavior by holding `Ctrl` (or `Cmd` on macOS) when the note opens.
- **Pair with back navigation.** After jumping to a literature note, press `Ctrl+Alt+Left` (Windows/Linux) or `Cmd+Alt+Left` (macOS) to return to your original document. This creates a fluid reading-and-annotating workflow.
