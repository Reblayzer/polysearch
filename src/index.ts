/**
 * polysearch public API.
 *
 * The whole project hangs off one idea: every search backend, whatever it is,
 * implements the same `SearchEngine` interface. The CLI and the compare logic
 * depend only on this interface and never on a concrete engine. The three
 * adapters (Elasticsearch, OpenSearch, Solr) land on days 2-7.
 */

import type {
  BulkResult,
  Document,
  EngineConfig,
  EngineName,
  ExplainResult,
  IndexSchema,
  SearchOptions,
  SearchResult,
} from './types';
import type { Query } from './query/types';

/**
 * The contract every engine adapter must fulfil. Six operations cover the
 * lifecycle of a searchable index: define it, fill it, query it, explain a
 * result, remove documents, and tear it down.
 */
export interface SearchEngine {
  /** Create an index (with its field mappings) if it does not already exist. */
  createIndex(name: string, schema: IndexSchema): Promise<void>;

  /** Index many documents in one batched request. */
  bulkIndex(index: string, docs: Document[]): Promise<BulkResult>;

  /** Run a unified query and return a page of scored, ranked hits. */
  search(index: string, query: Query, opts?: SearchOptions): Promise<SearchResult>;

  /** Explain how a single document scored against a query (for debugging relevance). */
  explain(index: string, query: Query, docId: string): Promise<ExplainResult>;

  /** Delete documents by id. */
  deleteDocs(index: string, ids: string[]): Promise<void>;

  /** Drop an index entirely. */
  dropIndex(name: string): Promise<void>;
}

/**
 * Build an engine adapter by name. This is the one place callers choose a
 * backend; everything downstream just sees a `SearchEngine`.
 *
 * Not implemented yet: the concrete adapters arrive over days 2-7. The signature
 * is fixed now so the rest of the codebase can be written against it.
 */
export function createEngine(name: EngineName, _config: EngineConfig): SearchEngine {
  throw new Error(
    `createEngine: the "${name}" adapter is not implemented yet. ` +
      'Adapters land incrementally (Elasticsearch, then OpenSearch, then Solr).',
  );
}

export type {
  BulkResult,
  BulkError,
  Document,
  DocumentId,
  EngineConfig,
  EngineName,
  ExplainResult,
  FieldDefinition,
  FieldType,
  Hit,
  IndexSchema,
  SearchOptions,
  SearchResult,
} from './types';

export type {
  BoolQuery,
  Highlight,
  MatchQuery,
  Query,
  QueryClause,
  RangeQuery,
  SortField,
  TermQuery,
} from './query/types';
