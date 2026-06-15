/**
 * polysearch public API.
 *
 * The whole project hangs off one idea: every search backend implements the same
 * `SearchEngine` interface (defined in ./engine). The CLI and the compare logic
 * depend only on that interface. `createEngine` is the single place a concrete
 * backend is chosen.
 */
import type { EngineConfig, EngineName } from './types';
import type { SearchEngine } from './engine';
import { ElasticsearchAdapter } from './engines/elasticsearch';
import { OpenSearchAdapter } from './engines/opensearch';
import { SolrAdapter } from './engines/solr';
import { PolySearchError } from './errors';

/**
 * Build an engine adapter by name. This is the one place callers pick a backend;
 * everything downstream just sees a `SearchEngine`.
 */
export function createEngine(name: EngineName, config: EngineConfig): SearchEngine {
  switch (name) {
    case 'elasticsearch':
      return new ElasticsearchAdapter(config);
    case 'opensearch':
      return new OpenSearchAdapter(config);
    case 'solr':
      return new SolrAdapter(config);
    default: {
      const exhaustive: never = name;
      throw new PolySearchError(`createEngine: unknown engine "${String(exhaustive)}"`);
    }
  }
}

export type { SearchEngine } from './engine';
export { ElasticsearchAdapter } from './engines/elasticsearch';
export { OpenSearchAdapter } from './engines/opensearch';
export { SolrAdapter } from './engines/solr';

export { PolySearchError, FieldValidationError, EngineRequestError, TimeoutError } from './errors';

export { compare, buildComparison, formatComparison, jaccard } from './compare';
export type {
  NamedEngine,
  EngineResult,
  DocumentComparison,
  EngineFailure,
  ComparisonResult,
} from './compare';

export type {
  BulkResult,
  BulkError,
  Document,
  DocumentId,
  EngineConfig,
  EngineName,
  ExplainResult,
  FacetBucket,
  FacetResult,
  FieldDefinition,
  FieldType,
  Hit,
  IndexSchema,
  SearchOptions,
  SearchResult,
  SuggestRequest,
  Suggestion,
  SuggestResult,
} from './types';

export type {
  BoolQuery,
  FacetRange,
  FacetRequest,
  Highlight,
  MatchQuery,
  Query,
  QueryClause,
  RangeFacet,
  RangeQuery,
  SortField,
  TermQuery,
  TermsFacet,
} from './query/types';
