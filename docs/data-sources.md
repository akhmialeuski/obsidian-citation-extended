# Data Sources

The plugin supports loading bibliography data from multiple sources and formats.

## Supported Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| **CSL-JSON** | `.json` | Standard citation format, fast loading |
| **BibLaTeX** | `.bib` | Rich format with PDF paths, keywords, notes. Slower to parse but more data available |
| **Hayagriva** (planned) | `.yml` | YAML-based bibliography format |

## Source Types

### Local File (default)

Reads from the filesystem using an absolute path or a path relative to the vault root. Uses `chokidar` for file watching on desktop — when the file changes, the library reloads automatically.

### Vault File

Reads from a file inside the Obsidian vault using the Vault API. Works on mobile (iOS/Android). Uses Obsidian's vault events for change detection.

## Multiple Databases

You can configure multiple databases in settings. All entries are loaded and merged into a single searchable library.

### Duplicate Handling

When the same citekey appears in multiple databases:

- Both entries are preserved in the library
- In the search modal, duplicates show a prefix: `DatabaseName:citekey`
- The merge strategy (configurable) determines which entry takes precedence for note creation

### Merge Strategies

| Strategy | Behavior |
|----------|----------|
| **Last wins** (default) | The last database in the list provides the canonical entry |
| **First wins** | The first database's entry takes precedence |

## Architecture: Adding a New Data Source

The plugin uses a **DataSourceRegistry** pattern (open/closed principle). To add a new source type:

1. Implement the `DataSource` interface (`load()`, `watch()`, `dispose()`)
2. Register it in `main.ts`:

```typescript
registry.register('my-source', (def, id) =>
  new MyCustomSource(id, def.path, def.format, workerManager),
);
```

3. Add the type to `DataSourceType` and `DATABASE_TYPE_LABELS`
4. The settings UI automatically picks up the new type from the labels map

See [Development Guide](development.md) for architectural details.

## Coming Soon

- **Hayagriva (YAML)** — native support for the Hayagriva bibliography format
- **Readwise API** — load highlights and annotations from Readwise
- **HTTP/Network sources** — fetch bibliography from a URL
