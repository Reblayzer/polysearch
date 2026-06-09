/**
 * Solr adapter: the third concrete `SearchEngine`, and the most divergent.
 *
 * Solr shares Lucene and BM25 with Elasticsearch/OpenSearch but exposes a
 * different API: a parameter model (`q`, `fq`, `sort`, `rows`, `hl`) with Lucene
 * query syntax as a string, not a JSON bool tree. So it has its own translator
 * (see ../../query/solr).
 *
 * Client choice: Solr's API is plain HTTP/JSON, and Node 22 ships `fetch`, so
 * this adapter talks to Solr directly rather than pulling in the unmaintained,
 * callback-style `solr-client` package. The upshot is a fully-typed Solr adapter
 * with zero third-party runtime dependencies.
 */
import type { SearchEngine } from '../../engine';
import type {
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
import { toSolrQuery } from '../../query/solr';
import { assertValidFieldName } from '../../query/field';

/** Our neutral field types mapped to Solr field types. */
const FIELD_TYPE_TO_SOLR: Record<FieldType, string> = {
  text: 'text_general',
  keyword: 'string',
  integer: 'pint',
  float: 'pfloat',
  boolean: 'boolean',
  date: 'pdate',
};

interface SolrStatusResponse {
  status: Record<string, { name?: string }>;
}

interface SolrFieldsResponse {
  fields: { name: string }[];
}

interface SolrSelectResponse {
  responseHeader: { QTime: number };
  response: { numFound: number; docs: Record<string, unknown>[] };
  highlighting?: Record<string, Record<string, string[]>>;
  debug?: { explain?: Record<string, string> };
}

interface SolrRequestInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Default client-side request timeout, so a hung connection can't hang the caller. */
const DEFAULT_TIMEOUT_MS = 30_000;

export class SolrAdapter implements SearchEngine {
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;

  constructor(config: EngineConfig) {
    // e.g. http://localhost:8983/solr
    this.baseUrl = config.node.replace(/\/+$/, '');
    this.authHeader =
      config.username !== undefined && config.password !== undefined
        ? `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
        : undefined;
  }

  private async request<T>(path: string, init?: SolrRequestInit): Promise<T> {
    const headers: Record<string, string> = { ...(init?.headers ?? {}) };
    if (this.authHeader) headers.Authorization = this.authHeader;

    // Native fetch has no default timeout; without this an unresponsive Solr
    // would hang the caller indefinitely.
    const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchInit: RequestInit = { headers, signal: AbortSignal.timeout(timeoutMs) };
    if (init?.method !== undefined) fetchInit.method = init.method;
    if (init?.body !== undefined) fetchInit.body = init.body;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, fetchInit);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new Error(`Solr request timed out after ${timeoutMs}ms: ${path}`);
      }
      throw err;
    }
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Solr request failed (${res.status}) ${path}: ${detail}`);
    }
    return (await res.json()) as T;
  }

  private async coreExists(name: string): Promise<boolean> {
    const status = await this.request<SolrStatusResponse>(
      `/admin/cores?action=STATUS&core=${encodeURIComponent(name)}&wt=json`,
    );
    return status.status[name]?.name !== undefined;
  }

  async createIndex(name: string, schema: IndexSchema): Promise<void> {
    if (!(await this.coreExists(name))) {
      await this.request(
        `/admin/cores?action=CREATE&name=${encodeURIComponent(name)}&configSet=_default&wt=json`,
      );
    }

    // Add only fields that do not already exist, so createIndex is idempotent
    // even when a core's instance dir persists across create/drop cycles (Solr
    // keeps the managed schema, and add-field errors on a duplicate field).
    const existing = await this.request<SolrFieldsResponse>(
      `/${encodeURIComponent(name)}/schema/fields?wt=json`,
    );
    const existingNames = new Set(existing.fields.map((f) => f.name));
    const addField = Object.entries(schema.fields)
      .filter(([field]) => !existingNames.has(field))
      .map(([field, def]) => ({
        name: field,
        type: FIELD_TYPE_TO_SOLR[def.type],
        stored: true,
        indexed: true,
        multiValued: false,
      }));
    if (addField.length === 0) return;

    await this.request(`/${encodeURIComponent(name)}/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'add-field': addField }),
    });
  }

  async bulkIndex(index: string, docs: Document[]): Promise<BulkResult> {
    if (docs.length === 0) return { indexed: 0, errors: [] };

    // A single Solr update request is all-or-nothing (it throws on failure), so
    // on success every document is indexed. commit=true makes them searchable
    // immediately, like Elasticsearch's refresh.
    await this.request(`/${encodeURIComponent(index)}/update?commit=true&wt=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs),
    });
    return { indexed: docs.length, errors: [] };
  }

  async search(index: string, query: Query, opts?: SearchOptions): Promise<SearchResult> {
    const { q, fq } = toSolrQuery(query.where);
    const params = new URLSearchParams();
    params.set('q', q);
    for (const filter of fq) params.append('fq', filter);
    params.set('fl', '*,score');
    params.set('wt', 'json');
    if (query.from !== undefined) params.set('start', String(query.from));
    if (query.size !== undefined) params.set('rows', String(query.size));
    if (query.sort) {
      for (const s of query.sort) assertValidFieldName(s.field);
      params.set('sort', query.sort.map((s) => `${s.field} ${s.order}`).join(', '));
    }
    if (query.highlight) {
      for (const field of query.highlight.fields) assertValidFieldName(field);
      params.set('hl', 'true');
      params.set('hl.fl', query.highlight.fields.join(','));
      // Cover both the unified (hl.tag.*) and original (hl.simple.*) highlighters.
      if (query.highlight.preTag !== undefined) {
        params.set('hl.tag.pre', query.highlight.preTag);
        params.set('hl.simple.pre', query.highlight.preTag);
      }
      if (query.highlight.postTag !== undefined) {
        params.set('hl.tag.post', query.highlight.postTag);
        params.set('hl.simple.post', query.highlight.postTag);
      }
    }
    if (opts?.timeoutMs !== undefined) params.set('timeAllowed', String(opts.timeoutMs));

    const data = await this.request<SolrSelectResponse>(
      `/${encodeURIComponent(index)}/select?${params.toString()}`,
      opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : undefined,
    );
    return mapSelectResponse(data);
  }

  async explain(index: string, query: Query, docId: string): Promise<ExplainResult> {
    const { q, fq } = toSolrQuery(query.where);
    const params = new URLSearchParams();
    params.set('q', q);
    for (const filter of fq) params.append('fq', filter);
    params.append('fq', `id:${quote(docId)}`);
    params.set('rows', '1');
    params.set('fl', '*,score');
    params.set('wt', 'json');
    params.set('debugQuery', 'true');

    const data = await this.request<SolrSelectResponse>(
      `/${encodeURIComponent(index)}/select?${params.toString()}`,
    );
    const doc = data.response.docs[0];
    return {
      id: docId,
      matched: data.response.numFound > 0,
      score: doc && typeof doc.score === 'number' ? doc.score : 0,
      detail: data.debug?.explain?.[docId] ?? '',
    };
  }

  async deleteDocs(index: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.request(`/${encodeURIComponent(index)}/update?commit=true&wt=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: ids }),
    });
  }

  async dropIndex(name: string): Promise<void> {
    if (!(await this.coreExists(name))) return;
    await this.request(
      `/admin/cores?action=UNLOAD&core=${encodeURIComponent(name)}` +
        `&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true&wt=json`,
    );
  }

  /** No persistent connection pool with fetch, so nothing to close. */
  async close(): Promise<void> {
    // Intentionally empty: native fetch holds no connection to tear down.
  }
}

/** Quote and escape a value for use inside a Lucene query (e.g. id:"..."). */
function quote(value: string): string {
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

/** Map a Solr select response into our neutral SearchResult. */
function mapSelectResponse(data: SolrSelectResponse): SearchResult {
  const highlighting = data.highlighting ?? {};
  const hits: Hit[] = data.response.docs.map((doc) => {
    const id = String(doc.id);
    const score = typeof doc.score === 'number' ? doc.score : 0;
    // Keep id, score and Solr's internal _version_ out of the returned source.
    const { id: _id, score: _score, _version_: _version, ...source } = doc;
    const hit: Hit = { id, score, source };
    const hl = highlighting[id];
    if (hl) hit.highlights = hl;
    return hit;
  });
  return { total: data.response.numFound, hits, tookMs: data.responseHeader.QTime };
}
