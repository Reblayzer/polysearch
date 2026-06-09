/**
 * OpenSearch adapter: the second concrete `SearchEngine`.
 *
 * OpenSearch is a fork of Elasticsearch 7.10, so the query DSL is identical and
 * the translator is shared (see ../../query/opensearch). The differences this
 * adapter exists to absorb are all in the client transport:
 *   - requests nest their payload under `body` (the older 7.x client style),
 *   - responses wrap their payload under `response.body`.
 *
 * Types: the translator emits a neutral compiled-query shape (see
 * ../../query/compiled) deliberately designed to be assignable to BOTH the
 * Elasticsearch and OpenSearch clients, so request bodies need no cast. The only
 * assertion that remains is on the response side: the OpenSearch client's
 * generated search-hit type is malformed in this version (see OsSearchHit), so
 * hits are read through a small, correct local shape.
 *
 * This is the only file (besides its shared translator) that imports the
 * OpenSearch client.
 */
import { Client, errors } from '@opensearch-project/opensearch';
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
import { buildSearchBody, translateClause } from '../../query/opensearch';

/** Our neutral field types mapped to OpenSearch mapping properties. `as const`
 * gives each `type` a literal type so the mapping is assignable to the client's
 * `Property` type without a cast. */
const FIELD_TYPE_TO_OS = {
  text: { type: 'text' },
  keyword: { type: 'keyword' },
  integer: { type: 'integer' },
  float: { type: 'float' },
  boolean: { type: 'boolean' },
  date: { type: 'date' },
} as const satisfies Record<FieldType, { type: string }>;

/** Minimal shape of OpenSearch's nested score-explanation tree. */
interface ExplanationNode {
  value: number;
  description: string;
  details?: ExplanationNode[];
}

/**
 * The fields we read off a search hit. We type these ourselves because the
 * OpenSearch client's generated `HitsMetadata.hits` type is malformed in this
 * version (it resolves to `Hit & {_source?: T}[]`, an intersection-with-array
 * that drops `_id`/`_score`/`highlight` when you iterate). So we read the hits
 * through this minimal, correct shape instead.
 */
interface OsSearchHit {
  _id?: string | number;
  _score?: number | null;
  _source?: Record<string, unknown>;
  highlight?: Record<string, string[]>;
}

export class OpenSearchAdapter implements SearchEngine {
  private readonly client: Client;

  constructor(config: EngineConfig) {
    // OpenSearch has no Elasticsearch-style API key, its client auth is basic
    // auth or AWS SigV4, so `config.apiKey` is intentionally not used here.
    this.client = new Client({
      node: config.node,
      ...(config.username !== undefined && config.password !== undefined
        ? { auth: { username: config.username, password: config.password } }
        : {}),
      ...(config.timeoutMs !== undefined ? { requestTimeout: config.timeoutMs } : {}),
    });
  }

  async createIndex(name: string, schema: IndexSchema): Promise<void> {
    // indices.exists does not throw on 404; it resolves with the status code.
    const exists = await this.client.indices.exists({ index: name });
    if (exists.statusCode === 200) return;

    const properties: Record<string, (typeof FIELD_TYPE_TO_OS)[FieldType]> = {};
    for (const [field, def] of Object.entries(schema.fields)) {
      properties[field] = FIELD_TYPE_TO_OS[def.type];
    }
    await this.client.indices.create({ index: name, body: { mappings: { properties } } });
  }

  async bulkIndex(index: string, docs: Document[]): Promise<BulkResult> {
    if (docs.length === 0) return { indexed: 0, errors: [] };

    const operations: Record<string, unknown>[] = [];
    for (const { id, ...source } of docs) {
      operations.push({ index: { _index: index, _id: id } });
      operations.push(source);
    }

    const response = await this.client.bulk({ body: operations, refresh: true });

    const errorList: BulkError[] = [];
    let indexed = 0;
    for (const item of response.body.items ?? []) {
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
        body: buildSearchBody(query),
        ...(opts?.timeoutMs !== undefined ? { timeout: `${opts.timeoutMs}ms` } : {}),
      },
      // Client-side abort, so a per-call timeout bounds the wait on both sides.
      opts?.timeoutMs !== undefined ? { requestTimeout: opts.timeoutMs } : undefined,
    );

    const body = response.body;
    const totalRaw = body.hits.total;
    const total = typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? 0);

    const rawHits = body.hits.hits as unknown as OsSearchHit[];
    const hits: Hit[] = rawHits.map((h) => {
      const hit: Hit = {
        id: String(h._id),
        score: h._score ?? 0,
        source: h._source ?? {},
      };
      if (h.highlight) hit.highlights = h.highlight;
      return hit;
    });

    return { total, hits, tookMs: body.took ?? 0 };
  }

  async explain(index: string, query: Query, docId: string): Promise<ExplainResult> {
    const response = await this.client.explain({
      index,
      id: docId,
      body: { query: translateClause(query.where) },
    });
    const explanation = response.body.explanation as ExplanationNode | undefined;
    return {
      id: docId,
      matched: response.body.matched,
      score: explanation?.value ?? 0,
      detail: formatExplanation(explanation),
    };
  }

  async deleteDocs(index: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const operations = ids.map((id) => ({ delete: { _index: index, _id: id } }));
    await this.client.bulk({ body: operations, refresh: true });
  }

  async dropIndex(name: string): Promise<void> {
    try {
      await this.client.indices.delete({ index: name });
    } catch (err) {
      if (err instanceof errors.ResponseError && err.statusCode === 404) return;
      throw err;
    }
  }

  /** Release the client's connections. Not part of the SearchEngine interface. */
  async close(): Promise<void> {
    await this.client.close();
  }
}

/** Flatten OpenSearch's nested score-explanation tree into a readable string. */
function formatExplanation(node: ExplanationNode | undefined, depth = 0): string {
  if (!node) return '';
  const indent = '  '.repeat(depth);
  const line = `${indent}${node.value} ${node.description}`;
  const children = (node.details ?? []).map((child) => formatExplanation(child, depth + 1));
  return [line, ...children].join('\n');
}
