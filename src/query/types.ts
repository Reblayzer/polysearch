/**
 * The unified Query DSL.
 *
 * This is the neutral, engine-agnostic way to describe a search in polysearch.
 * The caller builds one of these, and each engine adapter has a translator that
 * compiles it into that engine's native query (Elasticsearch/OpenSearch JSON, or
 * Solr's q/fq parameters). Keeping this type small and honest is deliberate: it
 * covers the practical primitives a product-search team actually uses, and no more.
 */

/** Full-text match. The value is analyzed (tokenized, lowercased) by the engine. */
export interface MatchQuery {
  type: 'match';
  field: string;
  value: string;
}

/** Exact match on a non-analyzed value. Use for ids, categories, booleans. */
export interface TermQuery {
  type: 'term';
  field: string;
  value: string | number | boolean;
}

/**
 * Numeric or date range. Any combination of bounds may be set.
 * gt = greater than, gte = greater-than-or-equal, lt/lte mirror that.
 */
export interface RangeQuery {
  type: 'range';
  field: string;
  gt?: number | string;
  gte?: number | string;
  lt?: number | string;
  lte?: number | string;
}

/**
 * Boolean combinator, the workhorse of real queries.
 * - must:     all clauses required, and they affect the relevance score.
 * - should:   optional clauses that boost the score when they match.
 * - mustNot:  clauses that exclude a document if they match.
 * - filter:   required clauses that do NOT affect the score (pure filtering,
 *             e.g. price <= 50). This score/filter split is the single most
 *             important relevance concept the DSL exposes.
 */
export interface BoolQuery {
  type: 'bool';
  must?: QueryClause[];
  should?: QueryClause[];
  mustNot?: QueryClause[];
  filter?: QueryClause[];
  /** How many `should` clauses must match for a doc to qualify. Defaults to engine behaviour. */
  minimumShouldMatch?: number;
}

/** Any single node in a query tree. A discriminated union keyed on `type`. */
export type QueryClause = MatchQuery | TermQuery | RangeQuery | BoolQuery;

/** Sort instruction. Results are sorted by relevance score unless sort is given. */
export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

/** Ask the engine to return matched snippets with the matched terms marked. */
export interface Highlight {
  fields: string[];
  /** Wrapping tags around a matched term. Default to <em>...</em> if unset. */
  preTag?: string;
  postTag?: string;
}

/**
 * A complete search request: what to match (`where`) plus how to page, sort and
 * highlight the results. This is the object a caller hands to `SearchEngine.search`.
 */
export interface Query {
  where: QueryClause;
  sort?: SortField[];
  /** Zero-based offset of the first result to return (for paging). */
  from?: number;
  /** Maximum number of results to return. */
  size?: number;
  highlight?: Highlight;
}
