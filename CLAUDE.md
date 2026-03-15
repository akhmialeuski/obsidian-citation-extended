# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin (TypeScript) that integrates bibliographic data from Zotero/reference managers into Obsidian notes. Provides citation search, insertion, and literature note creation from BibTeX/CSL-JSON sources.

## Commands

```bash
npm run dev          # Rollup watch mode (rebuilds to dist/ on change)
npm run build        # Production build (dist/main.js + static assets)
npm run lint         # ESLint with TypeScript strict rules
npm run lint -- --fix  # Auto-fix lint issues
npm test             # Jest test suite
npm test -- <path>   # Run single test file, e.g. npm test -- src/__tests__/bibtex.spec.ts
npm test -- --watch  # Watch mode
```

Build outputs to `dist/` (main.js, styles.css, manifest.json, versions.json).

## Architecture

**Entry point:** `src/main.ts` — `CitationPlugin extends Plugin` orchestrates the plugin lifecycle.

**Service layer** (manual DI, wired in `onload()`):
- `LibraryService` — loads entries from multiple data sources, merges, searches
- `TemplateService` — Handlebars rendering with custom helpers
- `NoteService` — literature note CRUD via Obsidian vault API
- `UIService` — command/hotkey registration
- `SearchService` — MiniSearch-based full-text search
- `IntrospectionService` — template variable discovery

**Contracts:** `src/container.ts` defines service interfaces (`ILibraryService`, `ITemplateService`, etc.) and `DataSourceFactory`.

**Data sources** (`src/sources/`):
- `LocalFileSource` — reads from filesystem via `FileSystemAdapter`
- `VaultFileSource` — reads from Obsidian vault
- Both share the `DataSource` interface: `load()`, `watch()`, `dispose()`

**Key patterns:**
- **Result type** (`src/result.ts`): `Result<T, E>` discriminated union with `ok()`/`err()` helpers — used instead of exceptions for expected errors
- **Domain errors** (`src/errors.ts`): `CitationError` hierarchy (`LibraryNotReadyError`, `EntryNotFoundError`, `TemplateRenderError`, `DataSourceError`)
- **Reactive store** (`src/store.ts`): pub/sub `LibraryStore` with `LoadingStatus` enum
- **Settings validation**: Zod schemas in `src/settings.ts`
- **Web Worker**: bibliography file parsing runs in a worker thread (`src/worker.ts`) via `WorkerManager`

## Lint Rules to Know

- `@typescript-eslint/no-explicit-any`: **error** — no `any` allowed
- `@typescript-eslint/no-floating-promises`: **error** — all promises must be awaited or voided
- `@typescript-eslint/unbound-method`: **error** (disabled in test files)
- `no-console`: **error** except `warn`, `error`, `debug`
- Prettier enforced via ESLint (single quotes, trailing commas)

## Pre-commit

Husky + lint-staged: `*.ts` → `eslint --fix`, `*.json` → `prettier --write`
