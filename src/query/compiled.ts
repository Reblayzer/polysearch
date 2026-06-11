/**
 * The compiled query JSON, as a neutral structural type.
 *
 * Elasticsearch and OpenSearch share the same query DSL for the primitives
 * polysearch supports, but their official clients ship separate, mutually
 * incompatible generated types. Rather than emit one vendor's types and cast to
 * the other's, the translator emits this neutral shape, deliberately a precise
 * subset that is assignable to BOTH clients' request types with no cast.
 */

export interface CompiledRange {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

export interface CompiledQuery {
  match?: Record<string, { query: string }>;
  term?: Record<string, { value: string | number | boolean }>;
  range?: Record<string, CompiledRange>;
  bool?: CompiledBool;
}

export interface CompiledBool {
  must?: CompiledQuery[];
  should?: CompiledQuery[];
  must_not?: CompiledQuery[];
  filter?: CompiledQuery[];
  minimum_should_match?: number;
}

/** A single sort instruction, e.g. `{ price: { order: 'asc' } }`. */
export type CompiledSort = Record<string, { order: 'asc' | 'desc' }>;

/**
 * One aggregation, in the ES-family shape. Like everything in this file it is
 * a precise subset assignable to BOTH clients' request types with no cast.
 */
export type CompiledAgg =
  | { terms: { field: string; size: number } }
  | { range: { field: string; ranges: { key: string; from?: number; to?: number }[] } };

export interface CompiledHighlight {
  fields: Record<string, Record<string, never>>;
  pre_tags?: string[];
  post_tags?: string[];
}

export interface CompiledSearchBody {
  query: CompiledQuery;
  from?: number;
  size?: number;
  sort?: CompiledSort[];
  highlight?: CompiledHighlight;
  aggs?: Record<string, CompiledAgg>;
  post_filter?: CompiledQuery;
}

/**
 * The compiled body for a prefix-based suggest (autocomplete) request.
 *
 * `match_phrase_prefix` keeps the typed tokens in order and treats the final
 * token as a prefix, which is exactly as-you-type semantics. `_source` is
 * narrowed to the single completed field so the engine only ships back what the
 * suggestion needs. Like CompiledSearchBody, this shape is a precise subset
 * assignable to both the Elasticsearch and OpenSearch clients with no cast.
 */
export interface CompiledSuggestBody {
  query: { match_phrase_prefix: Record<string, { query: string }> };
  size: number;
  _source: string[];
}
