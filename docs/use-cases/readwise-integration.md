# Use Case: Importing Readwise Highlights as Citations

## Problem

You use Readwise to collect highlights from books, articles, podcasts, and other sources. You want those highlights to be searchable and citable in Obsidian, just like your Zotero references -- without manually exporting files.

## Prerequisites

- An active [Readwise](https://readwise.io) account with highlights or Reader documents
- A Readwise API access token (get it from [readwise.io/access_token](https://readwise.io/access_token))
- The Citation plugin installed and configured

## Walkthrough

### Step 1: Open the Citation Databases Settings

1. Open **Settings** > **Citation plugin**
2. Find the **Citation databases** section at the top

### Step 2: Add a Readwise Database

1. Click the **Add database** button
2. A new database card appears with default settings
3. In the **Database type** dropdown, select **Readwise**
4. Optionally, rename the database (e.g. change `Database 2` to `Readwise`) in the name field

When you select the Readwise type, the card switches from a file path input to Readwise-specific fields: an API token input, a Validate button, and a Sync button.

### Step 3: Enter Your API Token

1. Paste your access token into the **API token** field (it is a password field -- the token is masked)
2. Click **Validate token** to verify the token works
3. You should see a "Token is valid" confirmation

If validation fails, double-check the token at [readwise.io/access_token](https://readwise.io/access_token) and ensure you have network connectivity.

### Step 4: Sync Data

Click **Sync now** to fetch your Readwise data. The plugin:

1. Calls both Readwise APIs in parallel:
   - **v2 Export API** -- fetches books with nested highlights (Kindle, Instapaper, etc.)
   - **v3 Reader API** -- fetches documents saved in Readwise Reader (articles, PDFs, etc.)
2. Converts each item into a searchable citation entry
3. Merges Readwise entries with your other databases
4. Updates the search index

After sync, your Readwise entries appear in the search modal alongside your other references. The status line below the token field shows the timestamp of the last sync.

### Step 5: Use Readwise Entries

Readwise entries work like any other citation entry:

- **Search**: Type book titles, author names, or keywords in the citation search modal
- **Insert citation**: Use `Insert Markdown citation` to add a `[@rw-12345]` or `[@rd-abc123]` citation
- **Create literature notes**: Use `Open literature note` to create a note for a Readwise entry
- **Templates**: All standard template variables work -- `{{title}}`, `{{authorString}}`, `{{abstract}}`, `{{note}}` (contains aggregated highlights), `{{keywords}}`, etc.

## Citekey Format

The plugin loads data from both Readwise APIs into a single database. Entries use different citekey prefixes depending on their origin:

| Source | Citekey format | Example |
|--------|---------------|---------|
| Readwise v2 Export (books, highlights) | `rw-{id}` | `rw-12345` |
| Readwise Reader v3 (documents, articles) | `rd-{id}` | `rd-abc123` |

Both types coexist in the same database and appear together in the search modal.

## Template Setup

Here is a template that works well for Readwise entries:

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
- `{{note}}` -- contains all highlights aggregated with `---` separators
- `{{zoteroSelectURI}}` -- links to the Readwise Reader app (not Zotero). For v2 books this is typically `https://read.readwise.io/read/{id}`; for v3 Reader documents it is the Reader document URL
- `{{URL}}` -- the original source URL (e.g., Amazon book page, article URL)
- `{{abstract}}` -- the book summary (from Readwise summary or document_note)
- `{{keywords}}` -- tags from Readwise
- `{{titleShort}}` -- the cleaned/readable title (v2 books)
- `{{source}}` -- origin such as `kindle`, `instapaper`, or the Reader source
- `{{containerTitle}}` -- the source site name (Reader documents, e.g. "The New Yorker")
- `{{ISBN}}` -- the Amazon ASIN for Kindle books
- `{{documentNote}}` -- a document-level note (distinct from individual highlights)
- `{{wordCount}}`, `{{readingProgress}}`, `{{readerLocation}}` -- Reader document metadata

### Rendering structured highlights

In addition to the aggregated `{{note}}` string, each Readwise entry exposes a structured `highlights` array. Iterate it with `{{#each entry.highlights}}` to render highlights with their per-item metadata (note, page/location, color, tags):

```handlebars
## Highlights

{{#each entry.highlights}}
- {{this.text}}{{#if this.location}} (loc. {{this.location}}){{/if}}{{#if this.color}} [{{this.color}}]{{/if}}
{{#if this.note}}  > {{this.note}}{{/if}}
{{/each}}
```

Each highlight item has: `text`, `note`, `location`, `locationType`, `color`, `highlightedAt`, `url`, and `tags`.

## Expected Output

After syncing, a Readwise book entry like "Atomic Habits" appears in search as:

```
rw-12345 -- Atomic Habits -- James Clear -- book
```

A Reader document like a saved article appears as:

```
rd-abc123 -- How to Take Smart Notes -- Sonke Ahrens -- article
```

Creating a literature note with the template above produces:

```markdown
---
title: "Atomic Habits"
authors: "James Clear"
type: book
source: Readwise
url: https://amazon.com/atomic-habits
readwise: https://read.readwise.io/read/01abc123
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

- By default, Readwise data syncs automatically every 30 minutes. You can change this interval in the **Auto-sync interval (minutes)** field on the database card, or set it to `0` to disable automatic sync entirely
- To pull the latest data immediately, click **Sync now** in the database card
- Rate limiting is handled automatically -- the plugin respects Readwise's API rate limits
- You can use Readwise alongside file-based databases (Zotero, BibTeX, etc.) -- all entries are merged into a single searchable library
- The plugin loads data from both Readwise APIs automatically; there is no mode selector
- **Import filters:** Expand **Advanced filters** on the database card to limit what gets imported -- by category, tag, Reader location, or a minimum highlight count. This is useful if you have thousands of items but only want a subset in Obsidian
- **Reader highlights:** Highlights and notes made inside Readwise Reader are merged into their parent document (rather than dropped), so they show up in `entry.highlights` and in search
- **Truthful sync:** If a manual **Sync now** fails (e.g., invalid token or network error), the plugin reports the error and leaves the "Last sync" timestamp unchanged -- it no longer reports a false success
- **Offline cache:** After each successful sync, data is cached locally at `.obsidian/plugins/citation-extended/readwise-cache-<id>.json` (one file per Readwise database). If the Readwise API is unavailable on the next plugin load (e.g., you are offline), the plugin falls back to the cached data and shows a warning. You do not need to manage the cache file -- it is updated automatically after a fully successful sync (a partial outage leaves the previous cache intact)
- **Reader URLs:** The `{{zoteroSelectURI}}` variable and the "Open in Readwise" action open items in the Readwise Reader app, not the legacy Readwise highlights page
- **Security:** Your API token is stored unencrypted in the plugin's `data.json`. Avoid committing the vault to a public repository, and regenerate the token at [readwise.io/access_token](https://readwise.io/access_token) if it is ever exposed

## Related

- [Configuration: Citation Databases](../configuration.md#citation-databases) -- database settings reference
- [Data Sources: Readwise API](../data-sources.md#readwise-api) -- technical details on field mapping
- [Multiple Databases](multiple-databases.md) -- working with Readwise alongside file-based sources
- [Template Variables](../templates/variables.md) -- all available template variables
