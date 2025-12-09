import { Library } from '../types';

export const KNOWN_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  citekey: 'Unique citekey',
  abstract: '',
  authorString: 'Comma-separated list of author names',
  containerTitle:
    'Title of the container holding the reference (e.g. book title for a book chapter, or the journal title for a journal article)',
  DOI: '',
  eprint: '',
  eprinttype: '',
  eventPlace: 'Location of event',
  language: 'Language code (e.g. en, ru)',
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
  year: 'Publication year',
  zoteroSelectURI: 'URI to open the reference in Zotero',
};

export interface VariableDefinition {
  key: string;
  description: string;
  example?: string;
}

export class IntrospectionService {
  /**
   * Analyze the library to find all available template variables.
   */
  public getTemplateVariables(library: Library): VariableDefinition[] {
    const variables = new Map<string, VariableDefinition>();

    // Add known variables first to ensure they are present and have descriptions
    for (const [key, description] of Object.entries(
      KNOWN_VARIABLE_DESCRIPTIONS,
    )) {
      variables.set(key, { key, description });
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
