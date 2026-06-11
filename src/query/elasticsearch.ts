/**
 * Translator: unified Query DSL -> the Elasticsearch-family query JSON.
 *
 * This is a pure function (no I/O), which is why it can be unit-tested without a
 * running engine. The Elasticsearch and OpenSearch adapters both call it: the
 * query DSL is identical between those engines, so it emits one neutral shape
 * (see ./compiled) that is assignable to both clients' request types without a
 * cast.
 *
 * The mapping is close to one-to-one because the unified DSL was modelled on this
 * family of engines. The few real differences are the naming quirks handled here:
 *   - bool.mustNot            -> bool.must_not
 *   - bool.minimumShouldMatch -> bool.minimum_should_match
 *   - sort [{field, order}]   -> [{ field: { order } }]
 *   - highlight.fields []     -> highlight.fields { name: {} }
 */
import type { BoolQuery, FacetRange, FacetRequest, Query, QueryClause, RangeQuery } from './types';
import type { FacetResult, SuggestRequest } from '../types';
import type {
  CompiledAgg,
  CompiledBool,
  CompiledQuery,
  CompiledRange,
  CompiledSearchBody,
  CompiledSuggestBody,
} from './compiled';
import { assertValidFieldName } from './field';
import { assertValidFacets, DEFAULT_TERMS_SIZE } from './facets';

/** Translate a single query clause into a compiled query container. */
export function translateClause(clause: QueryClause): CompiledQuery {
  switch (clause.type) {
    case 'match':
      assertValidFieldName(clause.field);
      return { match: { [clause.field]: { query: clause.value } } };
    case 'term':
      assertValidFieldName(clause.field);
      return { term: { [clause.field]: { value: clause.value } } };
    case 'range':
      assertValidFieldName(clause.field);
      return { range: { [clause.field]: translateRange(clause) } };
    case 'bool':
      return { bool: translateBool(clause) };
    default: {
      // Exhaustiveness guard: if a new clause type is added to the union without
      // a case here, this line stops compiling.
      const exhaustive: never = clause;
      return exhaustive;
    }
  }
}

/** Only emit the bounds that are actually set (from inclusive, to exclusive). */
function rangeBucket(range: FacetRange): { key: string; from?: number; to?: number } {
  const bucket: { key: string; from?: number; to?: number } = { key: range.key };
  if (range.from !== undefined) bucket.from = range.from;
  if (range.to !== undefined) bucket.to = range.to;
  return bucket;
}

/** Only emit the bounds that are actually set. */
function translateRange(clause: RangeQuery): CompiledRange {
  const bounds: CompiledRange = {};
  if (clause.gt !== undefined) bounds.gt = clause.gt;
  if (clause.gte !== undefined) bounds.gte = clause.gte;
  if (clause.lt !== undefined) bounds.lt = clause.lt;
  if (clause.lte !== undefined) bounds.lte = clause.lte;
  return bounds;
}

function translateBool(clause: BoolQuery): CompiledBool {
  const bool: CompiledBool = {};
  if (clause.must) bool.must = clause.must.map(translateClause);
  if (clause.should) bool.should = clause.should.map(translateClause);
  if (clause.mustNot) bool.must_not = clause.mustNot.map(translateClause);
  if (clause.filter) bool.filter = clause.filter.map(translateClause);
  if (clause.minimumShouldMatch !== undefined) {
    bool.minimum_should_match = clause.minimumShouldMatch;
  }
  return bool;
}

/**
 * Build a full search request body (everything except the index, which the
 * adapter passes separately) from a unified Query.
 */
export function buildSearchBody(query: Query): CompiledSearchBody {
  const body: CompiledSearchBody = {
    query: translateClause(query.where),
  };

  if (query.from !== undefined) body.from = query.from;
  if (query.size !== undefined) body.size = query.size;

  if (query.sort) {
    body.sort = query.sort.map((s) => {
      assertValidFieldName(s.field);
      return { [s.field]: { order: s.order } };
    });
  }

  if (query.highlight) {
    const fields: Record<string, Record<string, never>> = {};
    for (const field of query.highlight.fields) {
      assertValidFieldName(field);
      fields[field] = {};
    }
    const highlight: CompiledSearchBody['highlight'] = { fields };
    if (query.highlight.preTag !== undefined) highlight.pre_tags = [query.highlight.preTag];
    if (query.highlight.postTag !== undefined) highlight.post_tags = [query.highlight.postTag];
    body.highlight = highlight;
  }

  if (query.facets) {
    assertValidFacets(query.facets);
    const aggs: Record<string, CompiledAgg> = {};
    for (const facet of query.facets) {
      aggs[facet.field] =
        facet.type === 'terms'
          ? { terms: { field: facet.field, size: facet.size ?? DEFAULT_TERMS_SIZE } }
          : { range: { field: facet.field, ranges: facet.ranges.map(rangeBucket) } };
    }
    body.aggs = aggs;
  }

  if (query.postFilter) body.post_filter = translateClause(query.postFilter);

  return body;
}

/** The bucket slice of an aggregations response, shared by ES and OS. */
interface AggBucketsResponse {
  buckets: { key: string | number; doc_count?: unknown }[];
}

/** Type guard: narrow an unknown aggregation value to the expected bucket shape. */
function isAggBucketsResponse(value: unknown): value is AggBucketsResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buckets' in value &&
    Array.isArray((value as Record<string, unknown>)['buckets'])
  );
}

/**
 * Turn a search response's `aggregations` object back into neutral facet
 * results, in request order. Pure, so it is unit-testable and shared by the
 * Elasticsearch and OpenSearch adapters (their response shapes are identical
 * here). Both terms and range aggs answer with the same `buckets` array shape
 * because the builder names every range bucket with `key`.
 *
 * The parser is intentionally tolerant: if the response is missing an expected
 * aggregation (e.g. the engine was queried without facets), that facet comes
 * back with an empty buckets array rather than throwing.
 */
export function parseAggregations(
  aggregations: Record<string, unknown> | undefined,
  requests: FacetRequest[],
): FacetResult[] {
  return requests.map((request) => {
    const agg = aggregations?.[request.field];
    const buckets = isAggBucketsResponse(agg)
      ? agg.buckets.map((b) => ({ key: String(b.key), count: typeof b.doc_count === 'number' ? b.doc_count : 0 }))
      : [];
    return { field: request.field, type: request.type, buckets };
  });
}

/** The default number of suggestions to return when a request omits `size`. */
const DEFAULT_SUGGEST_SIZE = 10;

/**
 * Build the request body for a prefix-based autocomplete on this engine family.
 *
 * `match_phrase_prefix` is the right primitive here: it analyzes the prefix the
 * same way the field was indexed, requires the leading tokens to match in order,
 * and treats only the last token as an open-ended prefix. `_source` is narrowed
 * to the completed field so the response carries just the value to suggest.
 */
export function buildSuggestBody(request: SuggestRequest): CompiledSuggestBody {
  assertValidFieldName(request.field);
  return {
    query: { match_phrase_prefix: { [request.field]: { query: request.prefix } } },
    size: request.size ?? DEFAULT_SUGGEST_SIZE,
    _source: [request.field],
  };
}
