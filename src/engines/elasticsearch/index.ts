/**
 * Elasticsearch adapter: the first concrete `SearchEngine`.
 *
 * This is the only file in the codebase that imports the Elasticsearch client.
 * It implements the six interface methods by translating the unified Query (via
 * ../../query/elasticsearch) and calling the client, then mapping the responses
 * back into polysearch's neutral types.
 */
import { Client, errors } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import type { SearchEngine } from '../../engine';
import type {
  BulkError,
  BulkResult,
  Document,
  EngineConfig,
  ExplainResult,
  FieldType,
  Hit,
  IndexSchema,
  SearchOptions,
  SearchResult,
} from '../../types';
import type { Query } from '../../query/types';
import { buildSearchBody, translateClause } from '../../query/elasticsearch';

/** Our neutral field types mapped to Elasticsearch mapping properties. */
const FIELD_TYPE_TO_ES: Record<FieldType, estypes.MappingProperty> = {
  text: { type: 'text' },
  keyword: { type: 'keyword' },
  integer: { type: 'integer' },
  float: { type: 'float' },
  boolean: { type: 'boolean' },
  date: { type: 'date' },
};

export class ElasticsearchAdapter implements SearchEngine {
  private readonly client: Client;

  constructor(config: EngineConfig) {
    // API keys are an Elasticsearch feature (scoped, revocable service auth) and
    // take precedence over basic auth when supplied.
    const auth =
      config.apiKey !== undefined
        ? { apiKey: config.apiKey }
        : config.username !== undefined && config.password !== undefined
          ? { username: config.username, password: config.password }
          : undefined;

    this.client = new Client({
      node: config.node,
      ...(auth ? { auth } : {}),
      // Client-side request timeout (the client already defaults to 30s; this
      // lets callers configure it).
      ...(config.timeoutMs !== undefined ? { requestTimeout: config.timeoutMs } : {}),
    });
  }

  async createIndex(name: string, schema: IndexSchema): Promise<void> {
    if (await this.client.indices.exists({ index: name })) return;

    const properties: Record<string, estypes.MappingProperty> = {};
    for (const [field, def] of Object.entries(schema.fields)) {
      properties[field] = FIELD_TYPE_TO_ES[def.type];
    }
    await this.client.indices.create({ index: name, mappings: { properties } });
  }

  async bulkIndex(index: string, docs: Document[]): Promise<BulkResult> {
    if (docs.length === 0) return { indexed: 0, errors: [] };

    // The bulk API takes a flat array: an action line, then the document source,
    // repeated. So N documents produce 2N entries.
    const operations: (estypes.BulkOperationContainer | Record<string, unknown>)[] = [];
    for (const { id, ...source } of docs) {
      operations.push({ index: { _index: index, _id: id } });
      operations.push(source);
    }

    // refresh: true makes the documents immediately searchable. Fine for a dev
    // tool; a production ingest pipeline would not refresh on every batch.
    const response = await this.client.bulk({ operations, refresh: true });

    const errorList: BulkError[] = [];
    let indexed = 0;
    for (const item of response.items) {
      const result = item.index;
      if (result?.error) {
        errorList.push({
          id: String(result._id),
          reason: result.error.reason ?? 'unknown error',
        });
      } else {
        indexed++;
      }
    }
    return { indexed, errors: errorList };
  }

  async search(index: string, query: Query, opts?: SearchOptions): Promise<SearchResult> {
    const response = await this.client.search(
      {
        index,
        ...buildSearchBody(query),
        // `timeout` is the server-side search time budget.
        ...(opts?.timeoutMs !== undefined ? { timeout: `${opts.timeoutMs}ms` } : {}),
      },
      // `requestTimeout` is the client-side abort, so a per-call timeout bounds
      // the wait on both sides.
      opts?.timeoutMs !== undefined ? { requestTimeout: opts.timeoutMs } : undefined,
    );
    return mapSearchResponse(response);
  }

  async explain(index: string, query: Query, docId: string): Promise<ExplainResult> {
    const response = await this.client.explain({
      index,
      id: docId,
      query: translateClause(query.where),
    });
    return {
      id: docId,
      matched: response.matched,
      score: response.explanation?.value ?? 0,
      detail: formatExplanation(response.explanation),
    };
  }

  async deleteDocs(index: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const operations = ids.map((id) => ({ delete: { _index: index, _id: id } }));
    await this.client.bulk({ operations, refresh: true });
  }

  async dropIndex(name: string): Promise<void> {
    try {
      await this.client.indices.delete({ index: name });
    } catch (err) {
      // Deleting an index that is already gone is success for our purposes.
      if (err instanceof errors.ResponseError && err.statusCode === 404) return;
      throw err;
    }
  }

  /**
   * Release the client's connections. Not part of the SearchEngine interface
   * (the six methods are the contract); it exists so long-lived processes and
   * tests can shut down cleanly.
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

/** Map an Elasticsearch search response into our neutral SearchResult. */
function mapSearchResponse(response: estypes.SearchResponse): SearchResult {
  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

  const hits: Hit[] = response.hits.hits.map((h) => {
    const hit: Hit = {
      id: String(h._id),
      score: h._score ?? 0,
      source: (h._source ?? {}) as Record<string, unknown>,
    };
    if (h.highlight) hit.highlights = h.highlight;
    return hit;
  });

  return { total, hits, tookMs: response.took };
}

/** Flatten Elasticsearch's nested score-explanation tree into a readable string. */
function formatExplanation(node: estypes.ExplainExplanationDetail | undefined, depth = 0): string {
  if (!node) return '';
  const indent = '  '.repeat(depth);
  const line = `${indent}${node.value} ${node.description}`;
  const children = (node.details ?? []).map((child) => formatExplanation(child, depth + 1));
  return [line, ...children].join('\n');
}
