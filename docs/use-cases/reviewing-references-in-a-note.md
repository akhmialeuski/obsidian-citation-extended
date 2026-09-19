# Reviewing the References of a Note

## Problem

A long note accumulates citations faster than you can keep track of them. Halfway through a literature review you want to answer two different questions, and neither is comfortable to answer by scrolling: *what does this note cite in total*, and *where exactly did I cite this particular paper*.

The References sidebar answers both. It lists every reference the active note cites, rendered with your bibliography template, and each item navigates in two directions. A plain click opens the literature note for that reference, while a modifier-click moves the cursor to the place in the current note where the citation actually appears.

## Prerequisites

- At least one citation database configured and loaded
- A bibliography entry template configured in **Settings > Citation plugin**, where the default `{{authorString}} ({{year}}). {{title}}.` is a good starting point (see [Configuration](../configuration.md))
- A note open in the editor that contains at least one citation

## Step-by-Step Walkthrough

### Opening the Panel

1. Open the note you are working on. This example uses a survey draft:

   ```markdown
   Early convolutional work [@lecun1998] established the foundation, and
   AlexNet [@krizhevsky2012] showed what depth could do on ImageNet.

   Residual connections [@he2016] made very deep networks trainable. The
   same idea reappears in @he2016 as a general optimization argument, and
   later surveys [@huang2017; @tan2019] treat it as settled.
   ```

2. Open the panel from the ribbon, or run **Citations: Show references for current note** from the Command Palette (`Ctrl+P`).

3. The sidebar lists one item per distinct citekey, in the order the citations first appear in the note. Although `he2016` appears twice in the text, it is listed once, because the panel lists references rather than occurrences.

### Opening a Literature Note

Click any item. The literature note for that citekey opens, and is created from your template first if it does not exist yet. This is the same navigation the **Open literature note for citation at cursor** command performs, reached from the panel instead of from the text, as described in [Navigating from Citation to Note](navigating-from-citation-to-note.md).

### Finding Where a Citation Appears

Hold the platform modifier and click instead:

| Platform      | Modifier     | Result                                                |
| ------------- | ------------ | ----------------------------------------------------- |
| macOS         | `Cmd`-click  | The citekey is selected in the editor and scrolled to |
| Windows/Linux | `Ctrl`-click | The citekey is selected in the editor and scrolled to |

`Ctrl` on macOS is deliberately left alone, because there it opens the context menu.

1. `Cmd`/`Ctrl`-click the item for `he2016`. The editor selects the `@he2016` inside `[@he2016]` on the third line and scrolls it into view.

2. `Cmd`/`Ctrl`-click the same item again. The cursor advances to the second occurrence, the bare `@he2016` on the fifth line, and a notice reads `Citation 2 of 2`.

3. `Cmd`/`Ctrl`-click once more. The cycle wraps back to the first occurrence and the notice reads `Citation 1 of 2`.

A reference cited only once never shows a notice, because there is no position to keep track of.

### Copying the Bibliography

The **copy** button in the panel header puts every rendered reference on the clipboard, one per line, in the same order the panel lists them. Paste it under a `## References` heading to produce a bibliography that matches the note's actual citations.

## Expected Result

Starting from a note containing:

```markdown
Residual connections [@he2016] made very deep networks trainable. The
same idea reappears in @he2016 as a general optimization argument.
```

**Action:** `Cmd`-click (macOS) or `Ctrl`-click (Windows/Linux) the `he2016` item in the References sidebar, twice.

The first click selects `@he2016` in `[@he2016]`. The second selects the bare `@he2016` on the following line and shows the notice `Citation 2 of 2`. Both selections scroll into view and leave the document unchanged.

## Variations

### Citation Forms the Panel Recognizes

Every form the panel lists is also a form the jump can reach, because both run the same scan over the note:

| Form                 | Example                   | What the jump selects            |
| -------------------- | ------------------------- | -------------------------------- |
| Pandoc parenthetical | `[@he2016]`               | `@he2016` inside the brackets    |
| Pandoc multi-cite    | `[@huang2017; @tan2019]`  | Only the clicked key's own span  |
| Pandoc in-text       | `@he2016`                 | `@he2016`                        |
| Obsidian wiki link   | `[[@he2016]]`             | `@he2016` inside the link        |
| Wiki link with alias | `[[@he2016\|He et al.]]`  | `@he2016`, leaving the alias out |

In a multi-cite group only the citekey you clicked is selected, not the whole bracket, so a modifier-click on `tan2019` in `[@huang2017; @tan2019]` lands on `@tan2019` alone.

### Tracking Down a Typo

A citekey that does not resolve against your library is listed as missing, dimmed, with `(not in library)` after it. A plain click on such an item does nothing, since there is no entry to open a note for, but the modifier-click still works. That is the point of allowing it, because a citekey missing from the library is usually a citekey that was misspelled, and what you need is to see it in context and correct it.

1. The panel shows `@vaswni2017 (not in library)`.
2. `Cmd`/`Ctrl`-click it. The editor selects the misspelled citekey in the text.
3. Fix the spelling. The panel refreshes as you type and the item resolves against the library.

### Reading View and Stale Panels

The jump needs an editor to move a cursor in. If the note is open in reading view and no editor is available, a notice reads `Open a note in the editor to jump to a citation.` If the note changed since the panel last scanned it and the citekey is gone, the notice reads `No occurrence of @citekey found in this note.`

## Tips

- **The gesture shadows Obsidian's "open in new tab".** A `Cmd`/`Ctrl`-click normally opens a link in a new tab, but inside this panel it is repurposed for the in-note jump. A plain click is still the way to open the literature note.
- **The panel is read-only.** Neither gesture modifies your document, because the jump only moves the selection and scrolls it into view.
- **Switching notes restarts the cycle.** The position is remembered per citation and per note, so returning to a note you were cycling through starts again at the first occurrence instead of resuming an old position.
- **Pair it with the copy button.** Walk the panel top to bottom with modifier-clicks to check every citation reads correctly in context, then copy the bibliography once you are satisfied.
