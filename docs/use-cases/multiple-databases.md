# Multiple Databases

## Problem

You maintain more than one bibliography — perhaps a personal research library and a shared team library, or separate databases for different projects, or a Zotero collection alongside a legacy Mendeley export. You want all of these sources available in a single search modal so you can cite and create notes from any of them without switching databases.

The plugin supports up to 20 databases loaded simultaneously. All entries are merged into one searchable library, with configurable behavior for duplicate citekeys.

## Prerequisites

- Two or more bibliography files exported from your reference manager(s)
- Each file in a supported format: CSL-JSON (`.json`), BibLaTeX (`.bib`), or Hayagriva (`.yml`)
- File paths accessible from your vault (absolute paths, or relative to the vault root)

## Step-by-Step Walkthrough

### Adding Multiple Databases

1. Open **Settings > Citation plugin > Citation databases**.

2. Your first database is already configured. Give it a descriptive name, for example `Personal Library`. Select the format (e.g., `BibLaTeX`) and enter the file path:

   ```
   Name:   Personal Library
   Type:   BibLaTeX
   Path:   /home/user/Zotero/personal-library.bib
   ```

   The status indicator shows "Path verified" when the file is found.

3. Click **Add database** to add a second entry.

4. Configure the second database:

   ```
   Name:   Team Library
   Type:   CSL-JSON
   Path:   /home/user/Dropbox/shared/team-references.json
   ```

5. Click **Add database** again if you have a third source:

   ```
   Name:   Conference Papers
   Type:   BibLaTeX
   Path:   /home/user/Zotero/conference-2024.bib
   ```

6. Close settings. The plugin reloads all databases. The status bar shows the total count across all databases:

   ```
   Citations: 1847 entries
   ```

### Searching Across Databases

1. Open the Command Palette (`Ctrl+P`) and run any command that opens the search modal (or press your configured hotkey, e.g. `Ctrl+Shift+E`).

2. Search as usual. The modal searches across all loaded databases simultaneously. Results from different databases are interleaved based on search relevance.

3. When the same citekey exists in multiple databases, the search results show a prefix with the database name:

   ```
   Personal Library:smith2023
   Attention Is All You Need
   Smith, Jones (2023)

   Team Library:smith2023
   A Survey of Self-Attention Methods
   Smith, Lee, Chen (2023)
   ```

4. Select the entry you want. The prefix helps you identify which database each result comes from.

### Understanding Composite Citekeys

When the same citekey exists in multiple databases, each duplicate receives a **composite citekey** that includes the database's stable internal identifier. For example, if `smith2023` exists in two databases, the composite citekeys look like:

```
smith2023@db-1711234567-a1b2
smith2023@db-1711234890-c3d4
```

This composite citekey is used for literature note filenames and wiki-links. Because it is based on the database's internal id (not the display name), **you can freely rename databases** in settings without breaking any existing notes or links.

> **Note:** Single-database setups and multi-database setups without overlapping citekeys are not affected — citekeys remain unchanged (e.g. `smith2023`).

### Understanding the Merge Strategy

When the same citekey appears in multiple databases, the plugin needs to decide which entry to use for note creation. The current merge strategy is **Last wins**:

- Databases are processed in the order they appear in settings (top to bottom)
- For duplicate citekeys, the entry from the **last** database in the list takes precedence for note creation
- Both entries remain searchable — only the "canonical" entry used for note content is affected

**Example:** If `smith2023` exists in both `Personal Library` (first) and `Team Library` (second), the Team Library version is used when creating the literature note.

### Reordering Databases to Control Priority

To change which database takes precedence for duplicates:

1. Open **Settings > Citation plugin > Citation databases**
2. The databases are listed in order. The last one in the list has the highest priority
3. Rearrange by removing and re-adding databases in your preferred order

**Example:** To make your personal library take precedence over the team library, ensure `Personal Library` appears **after** `Team Library` in the list.

## Expected Result

### Status Bar

After configuring three databases:

```
Citations: 1847 entries
```

### Search Modal with Duplicates

Searching for a citekey that exists in two databases:

```
Personal Library:lecun2015
Deep learning
LeCun, Bengio, Hinton (2015)

Team Library:lecun2015
Deep learning
LeCun, Bengio, Hinton (2015)
```

### Search Modal without Duplicates

For unique citekeys, no prefix is shown:

```
Attention Is All You Need
Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)
vaswani2017
```

### Literature Note Created from Merged Entry

When you create a literature note for a duplicate citekey, the note uses the entry from the last database in the list (by default). The note itself does not contain any database prefix — it uses the clean citekey:

```markdown
---
title: "Deep learning"
authors: "LeCun, Bengio, Hinton"
year: 2015
citekey: lecun2015
---
```

## Variations

### Personal Library + Shared Team Library

A common setup for research groups:

| Database | Format | Path | Purpose |
|----------|--------|------|---------|
| Personal Library | BibLaTeX | `/home/user/Zotero/my-library.bib` | Your personal references, exported from Zotero with Better BibTeX |
| Team Library | CSL-JSON | `/home/user/Dropbox/team/references.json` | Shared team references, synced via Dropbox |

Put `Personal Library` last to prioritize your own annotations and notes over the team version.

### Mixing Formats

You can mix CSL-JSON, BibLaTeX, and Hayagriva databases freely:

| Database | Format | Use case |
|----------|--------|----------|
| Zotero export | BibLaTeX | Rich metadata with PDF paths and keywords |
| Mendeley export | CSL-JSON | Lightweight, fast loading |
| Typst bibliography | Hayagriva | YAML format for Typst documents |

All entries are normalized to a common internal format, so templates work the same regardless of the source format.

### Project-Specific Databases

For managing different research projects with separate bibliographies:

```
Database 1: Dissertation — /home/user/Zotero/dissertation.bib
Database 2: Side Project — /home/user/Zotero/side-project.bib
Database 3: Teaching — /home/user/Zotero/teaching.bib
```

All entries appear in one search, so you can cite across projects without reconfiguring.

### Vault File Sources

If your bibliography file is synced into your Obsidian vault (e.g., via Obsidian Sync or iCloud), you can use a vault-relative path:

```
Path: references/library.json
```

This is especially useful on mobile (iOS/Android) where absolute filesystem paths are not accessible.

## Tips

- **Naming matters.** Give each database a clear, descriptive name. These names appear as prefixes in the search modal when duplicates are found — `Team Library:smith2023` is much more helpful than `Database 2:smith2023`.
- **Renaming is safe.** You can rename a database at any time in settings. The plugin uses a stable internal identifier for composite citekeys, so renaming does not break existing literature notes or wiki-links.
- **Keep the total count reasonable.** The plugin handles large libraries well (5000+ entries), but loading 20 large BibLaTeX files simultaneously will increase load time. CSL-JSON is significantly faster to parse than BibLaTeX.
- **The file watcher works per-database.** Each database file is watched independently. If you update `personal-library.bib`, only that database is reloaded — the others stay cached.
- **Use "Refresh citation database" if something looks wrong.** If an entry from one database is not appearing, try running the refresh command from the Command Palette. This reloads all databases from disk.
- **Up to 20 databases are supported.** This is a practical limit to prevent excessive memory usage and load times.
