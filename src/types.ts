/**
 * Core, engine-neutral types shared across the whole library.
 *
 * Everything here describes data as polysearch sees it, independent of any one
 * engine. Each adapter is responsible for mapping these to and from its engine's
 * own shapes.
 */

/** The three backends polysearch can talk to. */
export type EngineName = 'elasticsearch' | 'opensearch' | 'solr';

/** Field types we support in an index schema. A small, practical subset. */
export type FieldType = 'text' | 'keyword' | 'integer' | 'float' | 'boolean' | 'date';

export interface FieldDefinition {
  type: FieldType;
}

/**
 * The shape of an index: a map of field name to its definition.
 * `text` fields are analyzed (full-text searchable); `keyword` fields are exact.
 */
export interface IndexSchema {
  fields: Record<string, FieldDefinition>;
}

/** Every document is identified by a string id. */
export type DocumentId = string;

/**
 * A document to index. It always has an `id`; all other fields are arbitrary and
 * must line up with the index schema. `unknown` (not `any`) keeps us honest:
 * callers must narrow a field's type before using it.
 */
export interface Document {
  id: DocumentId;
  [field: string]: unknown;
}

/** One document that failed to index during a bulk operation. */
export interface BulkError {
  id: DocumentId;
  reason: string;
}

/** Outcome of a bulk index operation. */
export interface BulkResult {
  indexed: number;
  errors: BulkError[];
}

/** A single search hit: a matched document plus its relevance score. */
export interface Hit {
  id: DocumentId;
  /** The engine's relevance score (BM25-based). Higher means more relevant. */
  score: number;
  /** The document's stored fields. */
  source: Record<string, unknown>;
  /** Matched snippets per field, present only if highlighting was requested. */
  highlights?: Record<string, string[]>;
}

/** A page of search results. */
export interface SearchResult {
  /** Total number of matching documents (not just the returned page). */
  total: number;
  hits: Hit[];
  /** Server-reported time the query took, in milliseconds. */
  tookMs: number;
}

/**
 * Why a specific document did (or did not) match, and how its score was built.
 * Engines return a verbose explanation tree; we normalise it to a readable string.
 */
export interface ExplainResult {
  id: DocumentId;
  matched: boolean;
  score: number;
  detail: string;
}

/** Cross-cutting options for a single search call. */
export interface SearchOptions {
  /** Abort the search if it exceeds this many milliseconds. */
  timeoutMs?: number;
}

/** Connection settings for an engine adapter. */
export interface EngineConfig {
  /** Base URL of the engine, e.g. http://localhost:9200 */
  node: string;
  username?: string;
  password?: string;
}
