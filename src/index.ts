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

/**
 * Build an engine adapter by name. This is the one place callers pick a backend;
 * everything downstream just sees a `SearchEngine`.
 */
export function createEngine(name: EngineName, config: EngineConfig): SearchEngine {
  switch (name) {
    case 'elasticsearch':
      return new ElasticsearchAdapter(config);
    case 'opensearch':
    case 'solr':
      throw new Error(
        `createEngine: the "${name}" adapter is not implemented yet. ` +
          'It lands later in the build (OpenSearch, then Solr).',
      );
    default: {
      const exhaustive: never = name;
      throw new Error(`createEngine: unknown engine "${String(exhaustive)}"`);
    }
  }
}

export type { SearchEngine } from './engine';
export { ElasticsearchAdapter } from './engines/elasticsearch';

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
