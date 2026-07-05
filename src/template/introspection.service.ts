import { Library } from '../core';

const KNOWN_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  citekey: 'Unique citekey',
  abstract: '',
  authorString: 'Comma-separated list of author names',
  containerTitle:
    'Title of the container holding the reference (e.g. book title for a book chapter, or the journal title for a journal article)',
  DOI: '',
  eprint: '',
  eprinttype: '',
  eventPlace: 'Location of event',
  ISBN: 'International Standard Book Number',
  keywords:
    'List of keywords/tags for the entry. Iterate with {{#each keywords}} or join with {{join keywords ", "}}',
  tags: 'Alias for keywords using Zotero terminology (Zotero tags). Iterate with {{#each tags}}',
  collections:
    'Zotero collection names the entry belongs to (Better BibTeX with "Export collections" enabled). Iterate with {{#each collections}}',
  language: 'Language code (e.g. en, ru)',
  lastname: 'Family name of the first author',
  note: '',
  page: 'Page or page range',
  publisher: '',
  publisherPlace: 'Location of publisher',
  source: 'Source of the reference (e.g. YouTube, arXiv.org)',
  title: '',
  titleShort: '',
  type: 'CSL type of the reference (e.g. article-journal, webpage, motion_picture)',
  URL: '',
  series: 'Series name (e.g. "Lecture Notes in Computer Science")',
  volume: 'Volume number',
  date: 'Publication date (YYYY-MM-DD)',
  dateEnd: '',
  dateStart: '',
  selectedText: 'Text selected in the editor when the command was invoked',
  year: 'Publication year',
  zoteroSelectURI: 'URI to open the reference in Zotero',
  currentDate:
    'Current date when the note is created (use as {{currentDate}} or {{currentDate format="DD.MM.YYYY"}})',
  // Readwise-specific variables
  asin: 'Amazon ASIN for Kindle books (v2 Export books only)',
  documentNote:
    'Readwise document-level note (v2 document_note / v3 Reader notes)',
  wordCount: 'Reader document word count',
  readingProgress: 'Reader reading progress as a fraction from 0 to 1',
  readerLocation:
    'Reader location of the document: new, later, shortlist, archive, or feed',
  // Source-agnostic annotations (Zotero PDF annotations, Readwise highlights, …)
  annotations:
    'Annotations from any source (Zotero PDF annotations, Readwise highlights). Iterate with {{#each annotations}} — each item has text, comment, type, color, colorName, page, pageLabel, tags, imagePath, openURI, source',
  annotationCount:
    'Number of annotations on the entry (0 when none) — use for {{#if annotationCount}} guards',
  attachments:
    'Source attachments (e.g. PDFs). Each item has id, path, title, openURI, annotationCount',
};

/** Static examples for helper-based variables that are not derived from entry data */
const KNOWN_VARIABLE_EXAMPLES: Record<string, string> = {
  currentDate: '2024-01-15',
};

/** Descriptor for a single Handlebars template variable surfaced by introspection. */
export interface VariableDefinition {
  key: string;
  description: string;
  example?: string;
}

/**
 * Discovers template variables available for Handlebars templates by
 * combining a static catalogue of known fields with runtime sampling of
 * library entries.
 */
export class IntrospectionService {
  /**
   * Analyze the library to find all available template variables.
   */
  public getTemplateVariables(library: Library | null): VariableDefinition[] {
    const variables = new Map<string, VariableDefinition>();

    // Add known variables first to ensure they are present and have descriptions
    for (const [key, description] of Object.entries(
      KNOWN_VARIABLE_DESCRIPTIONS,
    )) {
      variables.set(key, {
        key,
        description,
        example: KNOWN_VARIABLE_EXAMPLES[key],
      });
    }

    if (!library || library.size === 0) {
      return Array.from(variables.values());
    }

    // Sample a subset of entries to find dynamic variables
    // We check up to 50 entries to be safe and performant
    const entries = Object.values(library.entries).slice(0, 50);

    for (const entry of entries) {
      const entryJson = entry.toJSON();
      for (const [key, value] of Object.entries(entryJson)) {
        if (
          key.startsWith('_') ||
          typeof value === 'function' ||
          typeof value === 'object'
        ) {
          // Skip internal fields, functions, and complex objects (except arrays if we handled them, but for now simple values)
          // Actually, template variables can be anything, but usually strings or numbers.
          // The current template engine (Handlebars) can handle objects, but for the list we mostly care about primitives.
          // entry.toJSON() returns getters too.
          continue;
        }

        if (!variables.has(key)) {
          variables.set(key, {
            key,
            description: '', // No description for unknown fields
          });
        }

        // Add example if missing
        const variable = variables.get(key);
        if (
          variable &&
          !variable.example &&
          value &&
          (typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean')
        ) {
          variable.example = String(value);
        }
      }
    }

    return Array.from(variables.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }
}
