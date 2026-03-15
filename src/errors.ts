/**
 * Base class for all Citation plugin domain errors.
 */
export class CitationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CitationError';
    // Required when targeting ES5 — restores the prototype chain broken by
    // transpiled `class extends Error` so that `instanceof` checks work.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an operation requires the library to be loaded but it is not ready.
 */
export class LibraryNotReadyError extends CitationError {
  constructor(message = 'Citation library is still loading. Please wait.') {
    super(message, 'LIBRARY_NOT_READY');
    this.name = 'LibraryNotReadyError';
  }
}

/**
 * Thrown when a citekey lookup fails to find a matching entry.
 */
export class EntryNotFoundError extends CitationError {
  constructor(public readonly citekey: string) {
    super(`Entry not found for citekey: ${citekey}`, 'ENTRY_NOT_FOUND');
    this.name = 'EntryNotFoundError';
  }
}

/**
 * Thrown when a Handlebars template fails to compile or render.
 */
export class TemplateRenderError extends CitationError {
  constructor(
    message: string,
    public readonly templateName?: string,
  ) {
    super(message, 'TEMPLATE_RENDER_ERROR');
    this.name = 'TemplateRenderError';
  }
}

/**
 * Thrown when a data source operation fails (load, watch, etc.).
 */
export class DataSourceError extends CitationError {
  constructor(
    message: string,
    public readonly sourceId?: string,
  ) {
    super(message, 'DATA_SOURCE_ERROR');
    this.name = 'DataSourceError';
  }
}
