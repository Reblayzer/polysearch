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
import type { BoolQuery, QueryClause, RangeQuery } from './types';
import { assertValidFieldName } from './field';

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
