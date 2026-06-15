/**
 * Typed errors.
 *
 * Every error polysearch throws extends `PolySearchError`, so a caller can
 * `catch (err) { if (err instanceof PolySearchError) ... }` and discriminate by
 * subclass instead of string-matching messages. Errors raised by the underlying
 * Elasticsearch/OpenSearch clients keep their own types (they are already
 * discriminable, e.g. `errors.ResponseError`).
 */

/** Base class for all errors thrown by polysearch. */
export class PolySearchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PolySearchError';
  }
}

/** A field name (or other query input) failed validation. */
export class FieldValidationError extends PolySearchError {
  constructor(message: string) {
    super(message);
    this.name = 'FieldValidationError';
  }
}

/** An engine returned an error response (e.g. a non-2xx HTTP status from Solr). */
export class EngineRequestError extends PolySearchError {
  readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EngineRequestError';
    this.statusCode = statusCode;
  }
}

/** A request exceeded its client-side timeout. */
export class TimeoutError extends PolySearchError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
