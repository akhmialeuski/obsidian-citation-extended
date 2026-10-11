# Replacing a Selection with Template Output

## Problem

You created a literature note, and later added another PDF to the item in Zotero. The note still lists only the first PDF, because the line was rendered once, when the note was created. Deleting and recreating the note would lose everything you wrote in it, and changing your content template would not touch the notes that already exist.

The **Replace selection with template output** command fixes exactly the part you select. You select the outdated text, the dialog finds the part of your content template that produced it, you adjust that template if you like, and the selection is replaced with the template output rendered from the current library data. The rest of the note is not touched.

This is a manual, one-time replacement. The plugin does not track the replaced text afterwards: when Zotero gets another PDF, select the text and run the command again. To keep parts of a note refreshed automatically, see [Updating Literature Notes](updating-literature-notes.md).

## Prerequisites

- At least one citation database configured and loaded
- A literature note open in the editor that the plugin can match to a library entry (see [Renaming Literature Notes](renaming-literature-notes.md) for how notes are matched)
- A content template file set in **Settings > Citation plugin > Literature note content template file**, if you want to extract the template part instead of typing it

## Step-by-Step Walkthrough

This example uses a content template with this line:

```handlebars
PDF: {{#each (zoteroPdfURIs files)}}[PDF]({{this}}) {{/each}}
```

The note was created when the item had one PDF:

![Note with one PDF link](../images/replace-selection-note-before.png)

1. **Select the outdated text.** Select the line `PDF: [PDF](zotero://open-pdf/library/items/EBAUJBLY)`. The selection can be part of a line, a whole line or several lines.

2. **Open the dialog.** Run **Citations: Replace selection with template output** from the Command Palette (`Ctrl+P`), or right-click the selection and choose **Replace selection with template output**. The menu item appears whenever text is selected.

3. **Extract the template part.** In **Extract from**, keep the literature note template (or pick a profile template, when [template profiles](../configuration.md) are configured) and press **Extract**. The dialog finds the template lines that produced the selection, puts them into the **Template** field and says where they came from, for example `Extracted from citation-content-template.md, line 7.`

4. **Adjust the template.** Edit the template if you want a different output. Here the line is changed to show the PDF file names, using [`zoteroPdfMarkdownLinks`](../templates/helpers.md#zoteropdfmarkdownlinks):

   ```handlebars
   PDF: {{#each (zoteroPdfMarkdownLinks files)}}{{this}} {{/each}}
   ```

   The **Result in the note** preview shows the change with the current library data: the selected text is struck out, and the template output that replaces it is shown below.

   ![The dialog after Extract and an edit, previewing both PDFs](../images/replace-selection-dialog.png)

5. **Save the template as a profile (optional).** Type a name in **Profile**, for example `pdf-names`, and press **Save**. Next time, pick the profile in the same field instead of extracting and editing again.

6. **Apply.** Press **Apply**. The selection is replaced with exactly the template output, and nothing else in the note changes:

   ![Note after Apply with both PDFs named](../images/replace-selection-note-after.png)

## Profiles

A profile is a name and a template, stored in the plugin settings. In the **Profile** field of the dialog:

- Typing filters the list of profiles. Pick one to load its template.
- The last row of the list, **Create profile "…"**, starts a new profile under the typed name. **Save** stores it.
- The pencil next to a profile selects it for renaming: change the name in the field and press **Save**.
- **Save** stays disabled while the template is empty or another profile already uses the name.

Profiles can also be added, renamed, edited and removed in **Settings > Citation plugin > Fragment profiles**:

![Fragment profiles in the settings](../images/settings-fragment-profiles.png)

A profile only fills the dialog. Changing or deleting a profile later does not change any note where it was applied.

## Notes and Limits

- **Extract** matches every selected line with the most similar line of the rendered template. Text you rewrote heavily may not be found. The dialog then says so, and you can pick a profile or type the template yourself.
- A template line inside a block (`{{#each}}`, `{{#if}}`, `{{#syncBlock}}`) is extracted together with its whole block.
- The template is rendered with the entry of the current note only.
- If the template fails to render, the error is shown in **Result in the note** and **Apply** stays disabled.
