# Multi-Citation Workflow

## Problem

Academic writing often requires citing multiple sources together in a single parenthetical reference — for example, `[@lecun2015; @vaswani2017; @devlin2019]` — to support a claim with several pieces of evidence. Inserting each citation individually, then manually editing the brackets and semicolons, is slow and error-prone. You need a way to build multi-cite references efficiently.

The plugin offers three approaches for this, each suited to a different situation.

## Prerequisites

- At least one citation database configured and loaded
- (Optional) Hotkeys assigned:
  - **Citations: Insert multiple citations** — for building a new multi-cite from scratch
  - **Citations: Insert subsequent citation** — for appending to an existing citation
  - **Citations: Insert Markdown citation** — for single citations (suggested hotkey: `Ctrl+Shift+E`)

## Scenario 1: Insert Multiple Citations at Once

Use this when you want to build a combined citation `[@key1; @key2; @key3]` from scratch.

### Step-by-Step

1. Place your cursor where the multi-citation should appear:

   ```
   Recent advances in deep learning have produced remarkable results|
   ```

2. Open the Command Palette (`Ctrl+P`) and run **Citations: Insert multiple citations** (or press your assigned hotkey).

3. The search modal opens with a counter showing how many citations you have collected so far. Type to search for your first reference. For example, type `lecun deep`:

   ```
   Deep learning
   LeCun, Bengio, Hinton (2015)
   lecun2015
   ```

4. Press `Enter` to add this reference. The modal closes briefly and reopens, ready for the next selection. The counter now shows **1 citation collected**.

5. Search for your second reference. Type `vaswani attention`:

   ```
   Attention Is All You Need
   Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)
   vaswani2017
   ```

6. Press `Enter` to add it. The modal reopens again. Counter shows **2 citations collected**.

7. Search for your third reference. Type `devlin bert`:

   ```
   BERT: Pre-training of Deep Bidirectional Transformers
   Devlin, Chang, Lee, Toutanova (2019)
   devlin2019
   ```

8. You have two options for the last reference:
   - Press `Enter` to add it and continue selecting more, then press `Esc` to finalize
   - Press `Shift+Enter` to add it and insert immediately

9. Press `Esc` (or `Shift+Enter` on the last one). The combined citation is inserted:

   ```markdown
   Recent advances in deep learning have produced remarkable results[@lecun2015; @vaswani2017; @devlin2019]
   ```

### Expected Result

```markdown
[@lecun2015; @vaswani2017; @devlin2019]
```

The citations appear in the order you selected them, separated by `; @`.

## Scenario 2: Append to an Existing Citation

Use this when you already have a citation like `[@lecun2015]` in your text and want to add another reference to it.

### Step-by-Step

1. You have an existing citation in your text:

   ```markdown
   Deep learning has transformed computer vision [@lecun2015].
   ```

2. Place your cursor inside the citation brackets. Position it anywhere between `[` and `]`:

   ```markdown
   Deep learning has transformed computer vision [@lecun2015|].
   ```

3. Open the Command Palette (`Ctrl+P`) and run **Citations: Insert subsequent citation** (or press your assigned hotkey).

4. The search modal opens. Search for the reference you want to add. Type `krizhevsky imagenet`:

   ```
   ImageNet Classification with Deep Convolutional Neural Networks
   Krizhevsky, Sutskever, Hinton (2012)
   krizhevsky2012
   ```

5. Press `Enter` to select it.

6. The new citekey is appended to the existing citation with a semicolon separator:

   ```markdown
   Deep learning has transformed computer vision [@lecun2015; @krizhevsky2012].
   ```

7. You can repeat this process to add more references. Place your cursor inside the updated citation and run the command again.

### Expected Result

**Before:**

```markdown
[@lecun2015]
```

**After one append:**

```markdown
[@lecun2015; @krizhevsky2012]
```

**After two appends:**

```markdown
[@lecun2015; @krizhevsky2012; @he2016]
```

### Fallback Behavior

If your cursor is **not** inside an existing `[@...]` citation when you run **Insert subsequent citation**, the command falls back to a normal single citation insertion. This means you can safely use it as your default citation command — it appends when possible and inserts fresh otherwise.

## Scenario 3: Manual Multi-Cite with Repeated Single Citations

Use this as a quick alternative when you only need two citations and don't want to remember a separate command.

### Step-by-Step

1. Insert the first citation normally with **Insert Markdown citation** (via Command Palette or your configured hotkey):

   ```markdown
   The results confirm previous findings [@lecun2015]
   ```

2. Manually edit the text to open the citation for appending — delete the closing `]` and type `; `:

   ```markdown
   The results confirm previous findings [@lecun2015; |
   ```

3. Run **Insert Markdown citation** again and select the second reference.

4. The citation `[@vaswani2017]` is inserted at the cursor. Now manually clean up the extra bracket:

   ```markdown
   The results confirm previous findings [@lecun2015; [@vaswani2017]]
   ```

   Remove the extra `[` and `]` to get:

   ```markdown
   The results confirm previous findings [@lecun2015; @vaswani2017]
   ```

This approach works but is more error-prone than the dedicated commands. It is best reserved for the rare case when you need just one additional citation and already have the single-cite hotkey at hand.

## Expected Result Summary

| Method | Command | Result |
|--------|---------|--------|
| Insert multiple citations | `Citations: Insert multiple citations` | `[@lecun2015; @vaswani2017; @devlin2019]` |
| Insert subsequent citation | `Citations: Insert subsequent citation` | `[@lecun2015]` becomes `[@lecun2015; @krizhevsky2012]` |
| Manual (repeated single) | `Citations: Insert Markdown citation` x2 + manual edit | `[@lecun2015; @vaswani2017]` |

## Variations

### Custom Multi-Cite Separator

The multi-citation format uses `; @` as the separator between citekeys. This follows the Pandoc citation syntax standard. The separator is built into the plugin and is not configurable — it produces valid Pandoc multi-cite syntax that works with citeproc for PDF/DOCX export.

### Using Presets with Multi-Cite

Multi-cite commands always use the primary citation template format. If your preset is `textcite`, the multi-citation result uses the `textcite` primary format for each entry. However, the combined format with `; @` separators is designed for Pandoc-style `[@...]` citations, so the `citekey` preset or custom `[@{{citekey}}]` template works best with multi-cite.

## Tips

- **Use "Insert multiple citations" for three or more references.** It is faster than appending one at a time since the modal stays open.
- **Use "Insert subsequent citation" for adding one more reference to an existing citation.** Just place your cursor inside the brackets and go.
- **Order matters.** In the "Insert multiple citations" flow, citations appear in the order you select them. If you need alphabetical ordering for your citation style, select them in that order.
- **Esc finalizes the multi-citation.** In the multi-citation modal, pressing Esc does not cancel — it inserts all citations collected so far. If you have not selected any citations yet, Esc closes the modal without inserting anything.
- **Shift+Enter for the last one.** When you know you are selecting the final reference in the multi-citation flow, use `Shift+Enter` to add and insert in one step instead of pressing Enter then Esc.
