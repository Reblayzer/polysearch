/**
 * Translator: unified Query DSL -> Elasticsearch query language.
 *
 * This is a pure function (no I/O), which is why it can be unit-tested without a
 * running engine. The Elasticsearch adapter calls it to build the request body.
 *
 * The mapping is close to one-to-one because the unified DSL was modelled on this
 * family of engines. The few real differences are the naming quirks handled here:
 *   - bool.mustNot            -> bool.must_not
 *   - bool.minimumShouldMatch -> bool.minimum_should_match
 *   - sort [{field, order}]   -> [{ field: { order } }]
 *   - highlight.fields []     -> highlight.fields { name: {} }
 */
import type { estypes } from '@elastic/elasticsearch';
import type { BoolQuery, Query, QueryClause, RangeQuery } from './types';
import { assertValidFieldName } from './field';

/** Translate a single query clause into an Elasticsearch query container. */
export function translateClause(clause: QueryClause): estypes.QueryDslQueryContainer {
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

/** Only emit the bounds that are actually set. */
function translateRange(clause: RangeQuery): estypes.QueryDslRangeQuery {
  const bounds: Record<string, number | string> = {};
  if (clause.gt !== undefined) bounds.gt = clause.gt;
  if (clause.gte !== undefined) bounds.gte = clause.gte;
  if (clause.lt !== undefined) bounds.lt = clause.lt;
  if (clause.lte !== undefined) bounds.lte = clause.lte;
  return bounds;
}

function translateBool(clause: BoolQuery): estypes.QueryDslBoolQuery {
  const bool: estypes.QueryDslBoolQuery = {};
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
 * Build a full Elasticsearch search request body (everything except the index,
 * which the adapter passes separately) from a unified Query.
 */
export function buildSearchBody(query: Query): estypes.SearchRequest {
  const body: estypes.SearchRequest = {
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
    const fields: Record<string, estypes.SearchHighlightField> = {};
    for (const field of query.highlight.fields) {
      assertValidFieldName(field);
      fields[field] = {};
    }
    const highlight: estypes.SearchHighlight = { fields };
    if (query.highlight.preTag !== undefined) highlight.pre_tags = [query.highlight.preTag];
    if (query.highlight.postTag !== undefined) highlight.post_tags = [query.highlight.postTag];
    body.highlight = highlight;
  }

  return body;
}
