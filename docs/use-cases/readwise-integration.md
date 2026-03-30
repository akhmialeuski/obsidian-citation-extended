# Use Case: Importing Readwise Highlights as Citations

## Problem

You use Readwise to collect highlights from books, articles, podcasts, and other sources. You want those highlights to be searchable and citable in Obsidian, just like your Zotero references — without manually exporting files.

## Prerequisites

- An active [Readwise](https://readwise.io) account with highlights or Reader documents
- A Readwise API access token (get it from [readwise.io/access_token](https://readwise.io/access_token))
- The Citation plugin installed and configured

## Walkthrough

### Step 1: Enable Readwise Sync

1. Open **Settings** > **Citation plugin**
2. Scroll to **Readwise integration**
3. Toggle **Enable Readwise sync** to ON

### Step 2: Configure the Mode

Choose which data to import:

- **Readwise Highlights** — imports books and articles with their highlights from the Readwise v2 Export API. Best for Kindle readers, Instapaper users, and anyone who highlights content.
- **Readwise Reader Documents** — imports articles, PDFs, and other documents saved in Readwise Reader (v3 API). Best for Readwise Reader users who save web articles and documents.

### Step 3: Enter Your API Token

1. Paste your access token into the **API token** field (it's a password field — the token is masked)
2. Click **Validate token** to verify the token works
3. You should see "Token is valid" confirmation

### Step 4: Sync Data

Click **Sync now** to fetch your Readwise data. The plugin will:
1. Call the Readwise API to fetch all your books/highlights or documents
2. Convert each item into a searchable citation entry
3. Merge Readwise entries with your other databases
4. Update the search index

After sync, you'll see your Readwise entries in the search modal alongside your other references.

### Step 5: Use Readwise Entries

Readwise entries work like any other citation entry:

- **Search**: Type book titles, author names, or keywords in the citation search modal
- **Insert citation**: Use `Insert Markdown citation` to add a `[@rw-12345]` citation
- **Create literature notes**: Use `Open literature note` to create a note for a Readwise book
- **Templates**: All standard template variables work — `{{title}}`, `{{authorString}}`, `{{abstract}}`, `{{note}}` (contains aggregated highlights), `{{keywords}}`, etc.

## Template Setup

Here's a template that works well for Readwise entries:

```handlebars
---
title: {{quote title}}
authors: {{quote authorString}}
type: {{type}}
source: Readwise
url: {{URL}}
readwise: {{zoteroSelectURI}}
keywords: {{#each keywords}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
---

## Summary

{{abstract}}

## Highlights

{{note}}
```

**Template variable notes for Readwise entries:**
- `{{note}}` — contains all highlights aggregated with `---` separators (for highlights mode)
- `{{zoteroSelectURI}}` — links to the Readwise web page (not Zotero)
- `{{URL}}` — the original source URL (e.g., Amazon book page, article URL)
- `{{abstract}}` — the book summary (from Readwise summary or document_note)
- `{{keywords}}` — tags from Readwise

## Expected Output

After syncing, a Readwise book entry like "Atomic Habits" would appear in search as:

```
rw-12345 — Atomic Habits — James Clear — book
```

Creating a literature note with the template above would produce:

```markdown
---
title: "Atomic Habits"
authors: "James Clear"
type: book
source: Readwise
url: https://amazon.com/atomic-habits
readwise: https://readwise.io/bookreview/12345
keywords: habits, productivity, self-improvement
---

## Summary

An Easy & Proven Way to Build Good Habits & Break Bad Ones.

## Highlights

The most effective way to change your habits is to focus not on what you want to achieve, but on who you wish to become.

---

Every action you take is a vote for the type of person you wish to become.

---

You do not rise to the level of your goals. You fall to the level of your systems.
```

## Notes

- Readwise data is fetched on demand — there is no real-time push from Readwise
- After adding new highlights in Readwise, click "Sync now" in settings to pull the latest data
- Rate limiting is handled automatically — the plugin respects Readwise's API rate limits
- You can use Readwise alongside file-based databases (Zotero, BibTeX, etc.) — all entries are merged into a single searchable library
