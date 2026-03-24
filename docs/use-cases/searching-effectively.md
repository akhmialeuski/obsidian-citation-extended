# Searching Effectively

## Problem

Your bibliography library contains hundreds or thousands of entries. When you open the search modal, you need to find the right reference quickly — sometimes by title, sometimes by author, sometimes by a vague memory of a keyword or year. Understanding what the search supports and how to phrase your queries saves time on every citation you insert.

The plugin uses MiniSearch for full-text indexing, providing fuzzy matching, prefix matching, and accent-insensitive search out of the box.

## Prerequisites

- At least one citation database configured and loaded
- The status bar shows entries are loaded (e.g., `Citations: 1200 entries`)

## Step-by-Step Walkthrough

### Searching by Title

1. Open any search modal (e.g., `Ctrl+Shift+E` for citations).

2. Type a few words from the title:

   ```
   attention all you need
   ```

3. The modal shows matching results ranked by relevance:

   ```
   Attention Is All You Need
   Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)
   vaswani2017
   ```

   You do not need to type the full title. Even `attention need` will match.

### Searching by Author

1. Type an author's last name:

   ```
   hinton
   ```

2. All entries where Hinton is an author appear:

   ```
   ImageNet Classification with Deep Convolutional Neural Networks
   Krizhevsky, Sutskever, Hinton (2012)
   krizhevsky2012

   Deep learning
   LeCun, Bengio, Hinton (2015)
   lecun2015

   Distilling the Knowledge in a Neural Network
   Hinton, Vinyals, Dean (2015)
   hinton2015
   ```

### Searching by Year

1. Type a year:

   ```
   2017
   ```

2. All entries published in 2017 appear, sorted by relevance.

### Searching by Citekey

1. If you know the exact citekey, type it directly:

   ```
   vaswani2017
   ```

2. The entry appears immediately as a top result.

### Searching by Zotero ID

1. If your entry has a Zotero internal key (available when using Better BibTeX), you can search by it:

   ```
   W5JRT78A
   ```

2. The entry with that Zotero item key appears in the results. This is useful when you find a reference in Zotero and want to quickly locate it in Obsidian.

### Accent-Insensitive Search

The search normalizes diacritical marks, so you do not need to type accented characters.

1. Type without accents:

   ```
   muller
   ```

2. Entries authored by "Muller" appear:

   ```
   On the Convergence of Adam and Beyond
   Muller, Fischer (2019)
   muller2019
   ```

3. This also works in reverse — typing `Gomez` matches entries by "Gomez":

   ```
   gomez
   ```

   Matches: `Gomez, Rae, Kaiser (2017)`

### Fuzzy Matching (Handling Typos)

The search tolerates minor typos.

1. Type with a spelling mistake:

   ```
   attenshun
   ```

2. The search still finds the right entry:

   ```
   Attention Is All You Need
   Vaswani, Shazeer, Parmar (2017)
   vaswani2017
   ```

   Fuzzy matching has limits — it works best for single-character errors (substitutions, insertions, deletions). Badly misspelled words may not match.

### Prefix Matching

Type the beginning of a word, and entries matching that prefix appear.

1. Type a partial name:

   ```
   vash
   ```

2. The search matches the prefix against all indexed fields:

   ```
   Attention Is All You Need
   Vaswani, Shazeer, Parmar (2017)
   vaswani2017
   ```

### Combining Search Terms

1. Type multiple terms to narrow results:

   ```
   hinton 2015
   ```

2. Entries matching both "hinton" and "2015" are ranked higher:

   ```
   Distilling the Knowledge in a Neural Network
   Hinton, Vinyals, Dean (2015)
   hinton2015

   Deep learning
   LeCun, Bengio, Hinton (2015)
   lecun2015
   ```

## Configuring Sort Order

The default result order is by search relevance. You can change the base sort order (before search ranking) in settings.

1. Go to **Settings > Citation plugin > Display > Sort order**.

2. Choose one of:

   | Option | Behavior |
   |--------|----------|
   | Default (file order) | Entries appear in the order they are stored in the bibliography file |
   | By year (newest first) | Most recent publications first |
   | By year (oldest first) | Oldest publications first |
   | By author (A to Z) | Alphabetical by first author's last name |

3. Entries missing the sort field (e.g., no year) are placed at the end.

When you type a search query, the results are re-ranked by relevance. The sort order primarily affects the initial list shown before you type anything.

## Expected Result

### Search Input: `transformer self-attention 2017`

```
Attention Is All You Need
Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)
vaswani2017

Self-Attention with Relative Position Representations
Shaw, Uszkoreit, Vaswani (2018)
shaw2018
```

### Search Input: `lecun` (with sort order "By year, newest first")

```
Deep learning
LeCun, Bengio, Hinton (2015)
lecun2015

Gradient-Based Learning Applied to Document Recognition
LeCun, Bottou, Bengio, Haffner (1998)
lecun1998

Backpropagation Applied to Handwritten Zip Code Recognition
LeCun, Boser, Denker (1989)
lecun1989
```

## Variations

### Quick Citekey Lookup

If you remember the citekey, typing it is the fastest way to find an entry. Citekeys are fully indexed and treated as a searchable field, so `vaswani2017` immediately surfaces the right entry without needing to match against title or author text.

### Author + Topic Search

Combine an author name with a topic keyword:

```
bengio representation learning
```

This narrows results to entries by Bengio that mention representation learning, rather than showing all of Bengio's hundreds of papers.

## Tips

- **Type less, not more.** Two or three keywords are usually enough. The search ranks by relevance, so the best match appears first even with short queries.
- **Author last names are most reliable.** Given names are also indexed but last names tend to be more unique and produce fewer false matches.
- **The search index rebuilds on library load.** On a typical library of 1000-5000 entries, this takes under 200ms. You should not notice any delay.
- **Empty search field shows all entries.** When the modal opens with no query, entries are listed in your configured sort order. This is useful for browsing when you are not sure what you are looking for.
- **Search is case-insensitive.** `Smith`, `smith`, and `SMITH` all produce the same results.
- **Year search works as a filter.** Typing `2023` shows all entries from 2023. Combine with an author or keyword to narrow further: `smith 2023`.
- **Zotero ID search is exact.** Unlike title or author searches which support fuzzy matching, Zotero IDs (like `W5JRT78A`) are matched as exact strings in the index.
