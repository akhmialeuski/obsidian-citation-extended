# Updating Literature Notes

Keep existing literature notes in sync with your library and template **without losing anything you wrote by hand** — and without littering your notes with markers.

## The Ownership Model

The plugin only ever manages two things in a literature note:

1. **Frontmatter keys your template renders** (`title:`, `year:`, …). Keys you add by hand are yours and are always kept.
2. **Sync blocks** — callouts produced by the `{{#syncBlock}}` template helper, terminated by a native Obsidian block ID like `^zc-meta`.

**Everything else is yours.** Headings, paragraphs, lists, other callouts — anything without a `^zc-…` block ID is user content and is never touched by an update. You don't mark your content; the plugin marks its own.

## Sync Blocks in the Template

Wrap the parts of your *content template* that should stay live-synced in `{{#syncBlock}}`:

```handlebars
---
title: {{quote title}}
year: {{year}}
citekey: {{citekey}}
---

# {{title}}

{{#syncBlock "meta" title="Metadata"}}
**Authors:** {{authorString}}
**Year:** {{year}}
[Open in Zotero]({{zoteroSelectURI}})
{{/syncBlock}}

## My notes


{{#syncBlock "annotations" type="quote" title="Annotations" collapsed=true}}
{{#each annotations}}
{{this.text}} — p. {{this.pageLabel}}
{{/each}}
{{/syncBlock}}
```

This renders ordinary Obsidian callouts:

```markdown
> [!note] Metadata
> **Authors:** Smith, Jones
> **Year:** 2023
> [Open in Zotero](zotero://select/items/@smith2023)
> ^zc-meta
```

The `^zc-meta` line is a native block ID: invisible in reading view, and it makes the block linkable/embeddable like any other. Template content *outside* sync blocks (like the `## My notes` scaffold above) is rendered once at note creation and then belongs to you.

## Three-Way Merge

Every time a note is created or updated, the plugin stores a **baseline** — a snapshot of what it rendered — in its own data folder (never in your notes). On the next update it compares three versions of each block and frontmatter key: the baseline, your note, and the fresh render. That means it can tell *who* changed *what*:

| Situation | Result |
|---|---|
| Only the library changed | Block/key refreshed automatically |
| Only you edited it | Your version kept automatically |
| Both changed different lines inside a block | Merged automatically (git-style) |
| Both changed the same thing | **Conflict** → review dialog |
| You deleted a sync block from the note | Deletion respected — never re-appended |
| The library dropped a block you never edited | Block removed |
| New block appears in the template/library | Appended at the end of the note |

## The Review Dialog

When a conflict needs your decision (or always, if you prefer — see settings), the update shows a diff of exactly what would change:

- **Apply** — write the merge that keeps *your* version of every conflicted part
- **Use library version** — resolve conflicts toward the fresh library data
- **Skip** — leave this note untouched
- **Apply all / Skip all** — stop asking for the remaining notes in a batch

Nothing is ever written silently when there is doubt.

## The Commands

| Command | Scope |
|---------|-------|
| `Citations: Update all literature notes` | Every existing literature note |
| `Citations: Update literature note for current file` | Only the active note |

The single-note command finds the matching entry via the [note identifier field](../configuration.md#note-identifier-field) (when configured), the rendered title path, or an unambiguous filename match.

## Settings

**Note update mode** (`Settings → Citations`):

| Mode | Behaviour |
|------|-----------|
| **Smart sync** (default) | The model described above |
| **Update frontmatter only** | Frontmatter keys merged the same three-way way; body never touched |
| **Overwrite notes completely** | Whole note replaced by the fresh render |

**Review changes before writing:** `Only when there are conflicts` (default) · `Before every change` · `Never` (conflicted notes are skipped and reported).

## Notes Created Before This Feature

Old notes have no baseline yet, so on the *first* update the plugin cannot tell your edits from library changes. Anything that differs is treated as a conflict and shown in the review dialog — you decide once, a baseline is stored, and every later update is fully automatic. Notes whose sync blocks were never edited pass through without questions.

If your existing template doesn't use `{{#syncBlock}}` yet, updates simply refresh frontmatter keys (nothing in the body is plugin-owned) — add sync blocks to the template whenever you want body content managed too.

## Safety Guarantees

- **User content outside sync blocks is never modified.** Not on conflicts, not on any mode except explicit *Overwrite*.
- **No silent losses.** Every situation where an edit could be lost either merges cleanly, is kept in your favour, or goes through the review dialog.
- **Deletions are respected.** A sync block you removed stays removed (tracked via the baseline, not via anything in your note).
- **Idempotent.** Running an update twice changes nothing the second time; content never accumulates.
- **Only real changes are written** — untouched notes keep their modification time.
