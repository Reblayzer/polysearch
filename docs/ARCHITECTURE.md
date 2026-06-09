# Architecture

This document explains how polysearch is put together and why. It is the design reference for
the repository. For the user-facing summary, see the [README](../README.md).

## The one idea

Three different search backends, one interface. Elasticsearch, OpenSearch and Solr each have
their own client library and their own query language, but a caller should not have to care.
polysearch defines a single `SearchEngine` interface; each backend ships an **adapter** that
implements it. The CLI and the comparison logic are written against the interface alone and
have no knowledge of which engine is behind it.

```
                 ┌─────────────────────────────┐
   CLI / compare │     SearchEngine interface   │
                 └───────────────┬──────────────┘
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                     ▼
     ElasticsearchAdapter   OpenSearchAdapter     SolrAdapter
```

This is the classic adapter pattern. Its payoff here is concrete: the comparison mode can run
the same `Query` across any set of engines by iterating over a list of `SearchEngine` instances,
with zero engine-specific code in the comparison layer.

## Directory layout

```
src/
  index.ts          Public API: the SearchEngine interface, the createEngine factory,
                    and the re-exported public types.
  types.ts          Engine-neutral core types (Document, IndexSchema, SearchResult, ...).
  query/
    types.ts        The unified Query DSL types.
    (per-engine translators land here alongside the adapters)
  engines/
    elasticsearch/  Elasticsearch adapter (implements SearchEngine).
    opensearch/     OpenSearch adapter.
    solr/           Solr adapter.
  compare/          Run one query across N engines, diff the results, summarise.
  cli/              commander entrypoints: index, search, compare, explain.
test/
  unit/             Translator and pure-logic tests. No engines needed; run in CI.
  integration/      Tests against live containers; gated behind RUN_INTEGRATION=1.
docs/               This document and other design notes.
```

## Layers and data flow

There are three layers, each depending only on the one below it:

1. **Interface + types** (`index.ts`, `types.ts`, `query/types.ts`) — the vocabulary. No I/O.
2. **Adapters** (`engines/*`) — translate the unified `Query` into a native query, call the
   engine's client, and map the response back into neutral types.
3. **Consumers** (`compare/`, `cli/`) — depend only on the interface from layer 1.

A single search flows top to bottom and back:

```
unified Query
   -> adapter's translator compiles it to the engine's native query
   -> engine client sends it to the container
   -> engine returns scored hits
   -> adapter maps them back to a neutral SearchResult
```

A `compare` runs that pipeline once per engine, then diffs the result sets.

## The unified Query DSL

The `Query` type (`src/query/types.ts`) is deliberately small. It models the primitives a
product-search team actually uses and nothing more:

- `match` — analyzed full-text match.
- `term` — exact match on a non-analyzed value.
- `bool` — `must` / `should` / `must_not` / `filter`. The `filter` vs `must` split matters:
  `filter` clauses are required but do not contribute to the relevance score, which is how you
  express "price <= 50" without distorting ranking.
- `range` — numeric/date bounds.
- `sort`, `from` / `size`, `highlight` — result shaping.

Each adapter owns a translator from this type to its engine's native query. Keeping the DSL
narrow keeps the translators honest and the leak surface small.

## Design decisions

- **TypeScript strict, with `tsc` for type-checking and `tsup`/esbuild for the build.** Types
  catch translator mistakes at compile time. esbuild keeps builds fast and produces a clean
  ESM `dist` plus a single CLI entry once the CLI lands.
- **`unknown`, not `any`, for document field values.** Callers must narrow before use, which
  keeps the boundary between "data from an engine" and "typed code" explicit.
- **Integration tests gated behind an env var.** Unit tests (translators, pure logic) run on
  every push in CI with no infrastructure. Integration tests need live engines, so they run
  locally against docker-compose and stay out of the default CI path.
- **CLI-only for v1.** The comparison output is text designed to be readable and pasteable. A
  web UI is explicitly deferred.

## Elasticsearch and OpenSearch share a translator

OpenSearch is a fork of Elasticsearch 7.10, so for the primitives polysearch supports the query
DSL is identical. The OpenSearch translator (`src/query/opensearch.ts`) therefore re-exports the
Elasticsearch translator rather than duplicating it; a unit test pins that the two produce the
same body. The real differences are in the client transport, and they live entirely in the
OpenSearch adapter:

- requests nest their payload under `body` (the older 7.x client style), and responses wrap
  theirs under `response.body`;
- the two official clients ship separate generated TypeScript type universes, so the shared
  translator's output is cast to the OpenSearch body types at the call boundary (the request
  JSON is identical at runtime);
- the OpenSearch client's generated search-hit type is malformed in the pinned version, so the
  adapter reads hits through a small, correct local shape.

This is the clearest demonstration of why the interface earns its keep: two engines that are
nearly identical at the query level still differ enough at the client level that a caller should
not have to care.

## Solr is the divergent one

Where Elasticsearch and OpenSearch share a query language, Solr is genuinely different and has
its own translator (`src/query/solr.ts`):

- **Query model**: Solr takes a `q` string in Lucene query syntax plus `fq` filter params,
  not a JSON bool tree. The unified `bool` maps to `+`/`-`/unprefixed terms in `q` (must /
  must_not / should) with `filter` clauses pushed to `fq`. Ranges map to `[a TO b]` / `{a TO b}`
  bracket syntax.
- **Index management**: Solr's unit is a core, created via the CoreAdmin API and configured via
  the Schema API, versus a single JSON mappings call for ES/OS.
- **Client**: Solr's API is plain HTTP/JSON, so the adapter uses native `fetch` rather than the
  unmaintained `solr-client` package. The Solr adapter has zero third-party runtime
  dependencies.

## Where the abstraction leaks

A thin abstraction over three genuinely different engines cannot be perfect, and pretending
otherwise would be dishonest. The known leaks:

- **`minimumShouldMatch`** is honoured by the Elasticsearch and OpenSearch adapters but not by
  Solr's translator, because Solr's equivalent (`mm`) belongs to the edismax parser. A query
  relying on it behaves differently on Solr.
- **Bulk error granularity**: Elasticsearch and OpenSearch report per-document bulk errors. A
  single Solr update request is all-or-nothing, so the Solr adapter's `BulkResult.errors` is
  coarser.
- **Nested filters**: `bool.filter` maps to Solr's top-level `fq`, so filters on a nested `bool`
  are lifted to the top level. Equivalent for the common AND-of-filters case, an approximation
  for exotic nesting.
- **Scores are not comparable across engines**: even for "the same" query, the raw BM25 score
  differs between engines. This is exactly why the upcoming `compare` mode reports rank overlap
  and per-document deltas rather than pretending the numbers are equal.

Documenting these precisely is a goal of the project, not an embarrassment to hide.

## Out of scope for v1

Semantic/vector search, facets and aggregations beyond top-K, autocomplete / did-you-mean /
synonyms, cross-engine schema migration, and authentication beyond basic auth and API key.
These are tracked as future work rather than half-built.
