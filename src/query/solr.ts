/**
 * Translator: unified Query DSL -> Solr query parameters.
 *
 * Unlike Elasticsearch and OpenSearch (which take a JSON bool tree), Solr's
 * classic query model is parameters: a `q` string in Lucene query syntax plus a
 * list of `fq` filter queries that do not affect the score. So translation here
 * is string assembly, not object building, which is why Solr needs its own
 * translator rather than sharing one.
 *
 * Mapping:
 *   - bool.must    -> `+clause` in q (required, scores)
 *   - bool.should  -> `clause`  in q (optional, scores)
 *   - bool.mustNot -> `-clause` in q (excluded)
 *   - bool.filter  -> pushed to fq (required, does NOT score)
 *   - match        -> field:(value)
 *   - term         -> field:"value" (or field:value for numbers/booleans)
 *   - range        -> field:[a TO b] / {a TO b} bracket syntax
 *
 * Known limitation (documented as a leak): `minimumShouldMatch` is not honoured
 * here, because Solr's equivalent (`mm`) belongs to the edismax parser.
 */
import type { BoolQuery, FacetRange, FacetRequest, QueryClause, RangeQuery } from './types';
import type { FacetBucket, FacetResult, SuggestRequest } from '../types';
import { assertValidFieldName } from './field';
import { assertValidFacets, DEFAULT_TERMS_SIZE } from './facets';

/** The Solr-shaped query: a main `q` string and zero or more `fq` filters. */
export interface SolrQuery {
  q: string;
  fq: string[];
}

const SPECIAL = /[+\-!(){}[\]^"~*?:\\/&|]/g;

/** Escape Lucene query-syntax special characters in a value. */
function escapeValue(value: string): string {
  return value.replace(SPECIAL, '\\$&');
}

/** Render a term value: quoted for strings, bare for numbers and booleans. */
function renderTermValue(value: string | number | boolean): string {
  if (typeof value === 'string') return `"${value.replace(/(["\\])/g, '\\$1')}"`;
  return String(value);
}

/** Render a range as Solr bracket syntax, choosing inclusive vs exclusive ends. */
function renderRange(clause: RangeQuery): string {
  let lowerBracket = '[';
  let lower = '*';
  if (clause.gte !== undefined) {
    lowerBracket = '[';
    lower = String(clause.gte);
  } else if (clause.gt !== undefined) {
    lowerBracket = '{';
    lower = String(clause.gt);
  }

  let upperBracket = ']';
  let upper = '*';
  if (clause.lte !== undefined) {
    upperBracket = ']';
    upper = String(clause.lte);
  } else if (clause.lt !== undefined) {
    upperBracket = '}';
    upper = String(clause.lt);
  }

  return `${lowerBracket}${lower} TO ${upper}${upperBracket}`;
}

/**
 * Render a scoring clause into a Lucene query-syntax fragment. Filters found on
 * nested bool clauses are accumulated into `fq` (a top-level Solr concept).
 */
function renderClause(clause: QueryClause, fq: string[]): string {
  switch (clause.type) {
    case 'match':
      assertValidFieldName(clause.field);
      return `${clause.field}:(${escapeValue(clause.value)})`;
    case 'term':
      assertValidFieldName(clause.field);
      return `${clause.field}:${renderTermValue(clause.value)}`;
    case 'range':
      assertValidFieldName(clause.field);
      return `${clause.field}:${renderRange(clause)}`;
    case 'bool':
      return renderBool(clause, fq);
    default: {
      const exhaustive: never = clause;
      return exhaustive;
    }
  }
}

function renderBool(clause: BoolQuery, fq: string[]): string {
  const parts: string[] = [];
  for (const c of clause.must ?? []) parts.push(`+(${renderClause(c, fq)})`);
  for (const c of clause.should ?? []) parts.push(`(${renderClause(c, fq)})`);
  for (const c of clause.mustNot ?? []) parts.push(`-(${renderClause(c, fq)})`);
  // Filters are not scoring clauses; they become top-level fq params.
  for (const c of clause.filter ?? []) fq.push(renderClause(c, fq));
  return parts.join(' ');
}

/**
 * Translate a unified query's `where` clause into Solr's `q` + `fq`. An empty
 * `q` (e.g. a top-level bool with only filters) becomes `*:*`, Solr's match-all.
 */
export function toSolrQuery(where: QueryClause): SolrQuery {
  const fq: string[] = [];
  const q = renderClause(where, fq);
  return { q: q === '' ? '*:*' : q, fq };
}

/**
 * Build the Solr `q` for a prefix-based autocomplete.
 *
 * Solr has no `match_phrase_prefix`, so prefix semantics are expressed in Lucene
 * query syntax: every token but the last is matched whole, the last token gets a
 * trailing `*` wildcard, and each token is marked required (`+`) so all of them
 * must match. Each token is escaped first, then the wildcard is appended to the
 * final one as raw syntax (not escaped), so a user typing "table la" becomes
 * `title:(+table +la*)`. An empty or whitespace-only prefix has no token to
 * complete and yields `''`; the adapter treats that as "no suggestions" rather
 * than sending a match-all.
 *
 * Documented divergence: this is an AND of the tokens, not a phrase. The
 * Elasticsearch/OpenSearch `match_phrase_prefix` additionally requires the
 * tokens to be adjacent and in order, whereas Solr's `+a +b*` only requires both
 * to be present somewhere in the field. For autocomplete the practical results
 * are the same; matching Solr's phrase semantics exactly would need the heavier
 * `{!complexphrase}` parser.
 */
export function toSolrSuggest(request: SuggestRequest): string {
  assertValidFieldName(request.field);
  const tokens = request.prefix.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const last = tokens.length - 1;
  const terms = tokens.map((token, i) => `+${escapeValue(token)}${i === last ? '*' : ''}`);
  return `${request.field}:(${terms.join(' ')})`;
}

/** Tag put on the post-filter fq so every facet can exclude it from counting. */
export const POST_FILTER_TAG = 'pf';

/** Solr facet parameters as (name, value) pairs; names repeat, so not a record. */
export type SolrFacetParams = [string, string][];

/** Render one facet range bucket: from-inclusive `[`, to-exclusive `}` (or `]` for an open end). */
function renderFacetRange(range: FacetRange): string {
  const lower = range.from !== undefined ? String(range.from) : '*';
  const upper = range.to !== undefined ? String(range.to) : '*';
  const upperBracket = range.to !== undefined ? '}' : ']';
  return `[${lower} TO ${upper}${upperBracket}`;
}

/**
 * Translate facet requests into Solr's classic facet parameters.
 *
 * Terms facets use `facet.field`; arbitrary range buckets have no classic
 * equivalent of the ES range agg, so each bucket becomes its own `facet.query`.
 * Every facet carries `{!ex=pf}` so the (tagged) post-filter fq is excluded
 * from counting — Solr's tag/ex mechanism, the equivalent of ES `post_filter`
 * semantics. `facet.mincount=1` matches the ES terms agg, which only returns
 * buckets with matches.
 */
export function toSolrFacetParams(facets: FacetRequest[]): SolrFacetParams {
  assertValidFacets(facets);
  const params: SolrFacetParams = [['facet', 'true']];
  for (const facet of facets) {
    if (facet.type === 'terms') {
      params.push(['facet.field', `{!ex=${POST_FILTER_TAG}}${facet.field}`]);
      params.push([`f.${facet.field}.facet.limit`, String(facet.size ?? DEFAULT_TERMS_SIZE)]);
      params.push([`f.${facet.field}.facet.mincount`, '1']);
    } else {
      for (const range of facet.ranges) {
        params.push([
          'facet.query',
          `{!ex=${POST_FILTER_TAG}}${facet.field}:${renderFacetRange(range)}`,
        ]);
      }
    }
  }
  return params;
}

/**
 * Render a post-filter clause as ONE string (the adapter prefixes the
 * `{!tag=pf}`). Unlike the main translator, nested bool.filter clauses render
 * inline as required clauses: a post-filter must stay a single tagged fq —
 * spilling parts into separate untagged fq params would silently re-include
 * them in facet counting.
 */
export function toSolrPostFilter(clause: QueryClause): string {
  switch (clause.type) {
    case 'match':
    case 'term':
    case 'range':
      return renderClause(clause, []);
    case 'bool': {
      const parts: string[] = [];
      for (const c of clause.must ?? []) parts.push(`+(${toSolrPostFilter(c)})`);
      for (const c of clause.filter ?? []) parts.push(`+(${toSolrPostFilter(c)})`);
      for (const c of clause.should ?? []) parts.push(`(${toSolrPostFilter(c)})`);
      for (const c of clause.mustNot ?? []) parts.push(`-(${toSolrPostFilter(c)})`);
      return parts.join(' ');
    }
    default: {
      const exhaustive: never = clause;
      return exhaustive;
    }
  }
}

/** The slice of a Solr select response that carries facet counts. */
export interface SolrFacetCounts {
  facet_fields?: Record<string, (string | number)[]>;
  facet_queries?: Record<string, number>;
}

/**
 * Turn Solr's facet_counts back into neutral facet results, in request order.
 * facet_fields is Solr's flat [value, count, value, count, ...] array;
 * facet_queries is keyed by the exact query string we sent, so range buckets
 * are mapped back through the same rendering used to build the request.
 */
export function parseSolrFacets(
  counts: SolrFacetCounts | undefined,
  requests: FacetRequest[],
): FacetResult[] {
  return requests.map((request) => {
    if (request.type === 'terms') {
      const flat = counts?.facet_fields?.[request.field] ?? [];
      const buckets: FacetBucket[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        buckets.push({ key: String(flat[i]), count: Number(flat[i + 1]) });
      }
      return { field: request.field, type: 'terms' as const, buckets };
    }
    const buckets = request.ranges.map((range) => ({
      key: range.key,
      count:
        counts?.facet_queries?.[
          `{!ex=${POST_FILTER_TAG}}${request.field}:${renderFacetRange(range)}`
        ] ?? 0,
    }));
    return { field: request.field, type: 'range' as const, buckets };
  });
}
