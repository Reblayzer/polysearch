/**
 * The core contract. Every engine adapter implements this interface, and the
 * consumers (CLI, compare) depend only on it. Kept in its own file so adapters
 * can import the interface without pulling in the factory that constructs them.
 */
import type {
  BulkResult,
  Document,
  ExplainResult,
  IndexSchema,
  SearchOptions,
  SearchResult,
} from './types';
import type { Query } from './query/types';

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
