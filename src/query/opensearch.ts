/**
 * Translator: unified Query DSL -> OpenSearch query language.
 *
 * OpenSearch is a fork of Elasticsearch 7.10, so for the primitives polysearch
 * supports (match, term, range, bool, sort, paging, highlight) the query DSL is
 * identical. The translation logic is therefore shared with the Elasticsearch
 * translator rather than duplicated. The real differences between the two live
 * in the client transport (the `{ body }` request wrapper and the
 * `response.body` envelope), which the OpenSearch adapter handles.
 *
 * If the two query languages diverge in future, an OpenSearch-specific
 * translator would replace this re-export.
 */
export {
  buildSearchBody,
  buildSuggestBody,
  translateClause,
  parseAggregations,
} from './elasticsearch';
