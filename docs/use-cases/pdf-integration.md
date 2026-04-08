# PDF Integration

## Problem

Your reference manager (Zotero, Mendeley, or others) stores PDF files for each source. When reviewing a citation or literature note, you want quick access to the original PDF — either by opening it directly from the search modal, by clicking a link in your literature note, or by jumping to the entry in Zotero. Manually navigating to the PDF file on disk or switching to Zotero each time breaks your reading flow.

The plugin provides multiple ways to bridge the gap between your Obsidian notes and the PDF files managed by your reference manager.

## Prerequisites

- A BibLaTeX database configured (PDF paths are most reliably available in `.bib` files exported from Better BibTeX)
- Zotero installed locally (for the "Open in Zotero" and "Open PDF from modal" features)
- PDF files stored in a location accessible from your computer (e.g., Zotero's storage folder)

## Step-by-Step Walkthrough

### Opening a PDF from the Search Modal

1. Open the Command Palette (`Ctrl+P`) and run **Citations: Insert Markdown citation** (or any command that opens the search modal, or press your configured hotkey, e.g. `Ctrl+Shift+E`).

2. Search for the reference. For example, type `lecun deep`:

   ```
   Deep learning
   LeCun, Bengio, Hinton (2015)
   lecun2015
   ```

3. With the entry highlighted, press `Shift+Tab`.

4. The plugin opens the PDF file associated with this entry in your system's default PDF viewer. If the entry has no attached PDF, nothing happens.

### Opening the Entry in Zotero

1. Open any search modal (e.g., via the Command Palette or your configured hotkey).

2. Search for and highlight the reference.

3. Press `Tab`.

4. Zotero opens (or comes to the foreground) and selects the entry in your library. This uses the `zotero://select/items/@citekey` URI scheme, which requires Zotero to be installed.

### Adding a PDF Link in a Literature Note Template

#### Using `pdfMarkdownLink` (Recommended)

This helper generates a complete Markdown link to the first PDF attachment, with the filename (without extension) as display text.

Add this to your literature note content template:

```handlebars
{{! Generate a clickable Markdown link to the first PDF attachment }}
{{! Returns empty string if no PDF is available }}
{{pdfMarkdownLink entry.files}}
```

**Expected output:**

```markdown
[lecun2015](file:///home/user/Zotero/storage/ABCD1234/lecun2015.pdf)
```

#### Using `pdfLink` with Custom Link Text

If you want to control the link text:

```handlebars
{{! Generate a file:// URI to the first PDF }}
{{! Wrap in Markdown link syntax with custom text }}
{{#if (pdfLink entry.files)}}
[Open PDF]({{pdfLink entry.files}})
{{/if}}
```

**Expected output:**

```markdown
[Open PDF](file:///home/user/Zotero/storage/ABCD1234/lecun2015.pdf)
```

The `{{#if}}` block ensures nothing is rendered when there is no PDF available.

#### Using `urlEncode` with Raw File Paths

For advanced users who need to access the file path directly from BibLaTeX raw fields:

```handlebars
{{! Access the raw 'file' field from BibLaTeX and URL-encode it }}
{{#if entry.data.fields.file}}
[Open PDF](file://{{urlEncode entry.data.fields.file}})
{{/if}}
```

**Expected output for a file path with spaces:**

Input path: `/home/user/My Library/Smith 2023.pdf`

```markdown
[Open PDF](file:///home/user/My%20Library/Smith%202023.pdf)
```

The `urlEncode` helper escapes spaces and special characters so the link works correctly in the browser or PDF viewer.

### Complete Template with Conditional PDF Section

Here is a full literature note template that includes a PDF section only when a PDF is available:

```handlebars
---
title: {{quote title}}
authors: {{quote authorString}}
year: {{year}}
type: {{type}}
citekey: {{citekey}}
created: {{currentDate}}
---

# {{title}}

**Authors:** {{authorString}}
**Year:** {{year}}
**Journal:** {{containerTitle}}

{{! PDF section — only rendered when a PDF file is attached }}
{{#if (pdfLink entry.files)}}
## PDF

{{pdfMarkdownLink entry.files}}
{{/if}}

## Abstract

{{abstract}}

## Notes



## References

{{! Link to open the entry directly in Zotero }}
- [Open in Zotero]({{zoteroSelectURI}})
{{#if DOI}}- [DOI](https://doi.org/{{DOI}}){{/if}}
{{#if URL}}- [URL]({{URL}}){{/if}}
```

**Expected output (entry with PDF):**

```markdown
---
title: "Deep learning"
authors: "LeCun, Bengio, Hinton"
year: 2015
type: article-journal
citekey: lecun2015
created: 2025-03-24
---

# Deep learning

**Authors:** LeCun, Bengio, Hinton
**Year:** 2015
**Journal:** Nature

## PDF

[lecun2015](file:///home/user/Zotero/storage/ABCD1234/lecun2015.pdf)

## Abstract

An introduction to a broad range of topics in deep learning...

## Notes



## References

- [Open in Zotero](zotero://select/items/@lecun2015)
- [DOI](https://doi.org/10.1038/nature14539)
```

**Expected output (entry without PDF):**

```markdown
---
title: "Attention Is All You Need"
authors: "Vaswani, Shazeer, Parmar"
year: 2017
type: paper-conference
citekey: vaswani2017
created: 2025-03-24
---

# Attention Is All You Need

**Authors:** Vaswani, Shazeer, Parmar
**Year:** 2017
**Journal:** Advances in Neural Information Processing Systems

## Abstract

The dominant sequence transduction models...

## Notes



## References

- [Open in Zotero](zotero://select/items/@vaswani2017)
- [URL](https://arxiv.org/abs/1706.03762)
```

Notice the "PDF" section is completely absent when no PDF is available.

## Expected Result Summary

| Action | Keyboard shortcut | What happens |
|--------|-------------------|-------------|
| Open PDF from search modal | `Shift+Tab` | System PDF viewer opens the attached file |
| Open entry in Zotero | `Tab` | Zotero opens and selects the entry |
| PDF link in template (`pdfMarkdownLink`) | — | `[filename](file:///path/to/file.pdf)` rendered in note |
| PDF link in template (`pdfLink`)         | —             | `file:///path/to/file.pdf` URI rendered in note                       |
| PDF link in template (`urlEncode`)       | —             | `file:///path/to/url-encoded-file.pdf` URI rendered in note           |
| Open PDF in Zotero (`zoteroPdfURI`)      | —             | `zotero://open-pdf/library/items/ABCD1234` URI rendered in note       |
| Open all PDFs in Zotero (`zoteroPdfURIs`) | —            | Multiple `zotero://open-pdf` URIs, one per PDF attachment             |

## Variations

### Windows File Paths

On Windows, Zotero stores PDFs in paths like `C:\Users\me\Zotero\storage\ABCD1234\paper.pdf`. The `pdfLink` and `pdfMarkdownLink` helpers handle Windows paths correctly, producing:

```markdown
[paper](file:///C:/Users/me/Zotero/storage/ABCD1234/paper.pdf)
```

### Multiple PDF Attachments

If an entry has multiple PDF files, `pdfLink` and `pdfMarkdownLink` return the link for the **first** PDF in the list. To access other files, use the raw entry data:

```handlebars
{{#each entry.files}}
- [{{basename this}}](file://{{urlEncode this}})
{{/each}}
```

**Expected output:**

```markdown
- [paper.pdf](file:///home/user/Zotero/storage/ABCD1234/paper.pdf)
- [supplement.pdf](file:///home/user/Zotero/storage/ABCD1234/supplement.pdf)
```

### Open PDF Directly in Zotero

Use `zoteroPdfURI` to generate a `zotero://open-pdf` link that opens the PDF in Zotero's built-in reader instead of the system PDF viewer:

```handlebars
{{#if (zoteroPdfURI entry.files)}}
[Open in Zotero PDF reader]({{zoteroPdfURI entry.files}})
{{/if}}
```

**Expected output:**

```markdown
[Open in Zotero PDF reader](zotero://open-pdf/library/items/EBAUJBLY)
```

> The `{{#if}}` block ensures nothing is rendered when the entry has no PDF attachments or when the file path does not contain a Zotero storage key.

### Multiple PDFs — Open All in Zotero

When an entry has multiple PDF attachments (e.g. main paper + supplementary material), use `zoteroPdfURIs` to list them all:

```handlebars
{{#if (zoteroPdfURIs entry.files)}}
**PDFs:**
{{#each (split (zoteroPdfURIs entry.files) "\n")}}
- [PDF {{math @index "+" 1}}]({{this}})
{{/each}}
{{/if}}
```

**Expected output (entry with 2 PDFs and 1 HTML snapshot):**

```markdown
**PDFs:**
- [PDF 1](zotero://open-pdf/library/items/EBAUJBLY)
- [PDF 2](zotero://open-pdf/library/items/N6LQL4XL)
```

Non-PDF attachments (HTML snapshots, images) are automatically excluded.

### No PDF Attachments

When an entry has no PDF files (only HTML snapshots, or no attachments at all), both `zoteroPdfURI` and `zoteroPdfURIs` return an empty string. The `{{#if}}` wrapper ensures your note stays clean:

```handlebars
{{#if (zoteroPdfURI entry.files)}}
[Open PDF]({{zoteroPdfURI entry.files}})
{{else}}
*No PDF attached*
{{/if}}
```

### PDF Link with Custom Display Text

```handlebars
{{#if (pdfLink entry.files)}}
[Read "{{titleShort}}" (PDF)]({{pdfLink entry.files}})
{{/if}}
```

**Expected output:**

```markdown
[Read "Deep learning" (PDF)](file:///home/user/Zotero/storage/ABCD1234/lecun2015.pdf)
```

## Tips

- **BibLaTeX is required for PDF paths.** CSL-JSON exports from Zotero typically do not include file paths. Use Better BibTeX with BibLaTeX format to get the `file` field in your bibliography.
- **`Shift+Tab` and `Tab` work in any search modal.** Whether you opened it via the citation command, the link command, or the literature note command, these shortcuts are always available.
- **`file://` links may not work on all platforms.** Some operating systems or PDF viewers may not handle `file://` URIs. On macOS, most apps support them. On Windows, they work in most browsers but not all Markdown renderers. Test with your setup.
- **The `zoteroSelectURI` variable** is always available regardless of database format. It constructs the URI from the citekey using the pattern `zotero://select/items/@citekey`.
- **Conditional rendering prevents broken links.** Always wrap PDF links in `{{#if}}` blocks to avoid rendering empty `[Open PDF]()` links for entries without attachments.
