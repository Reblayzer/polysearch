# PolySearch

[![CI](https://github.com/Reblayzer/polysearch/actions/workflows/ci.yml/badge.svg)](https://github.com/Reblayzer/polysearch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

One `SearchEngine` interface across **Elasticsearch**, **OpenSearch** and **Solr**, a small
unified Query DSL that compiles to each engine's native query, and a comparison mode that runs
the same query across all three engines and reports the scoring and result-set differences.

> **Status: v1 feature-complete.** All three engine adapters (**Elasticsearch, OpenSearch,
> Solr**), the unified Query DSL, the `compare` mode and the CLI are in place, with unit and
> integration tests. The `main` branch is kept green. See the [Roadmap](#roadmap) for what is
> intentionally out of scope.

## Why

Elasticsearch, OpenSearch and Solr are all built on Apache Lucene and all score with BM25, yet
the same query over the same data does not produce identical rankings across them: their
defaults, tokenisation and tie-breaking differ. Existing universal clients tend to target a
single backend, or hide so much of each engine that those differences disappear.

PolySearch keeps the abstraction thin on purpose. It gives you one way to index and query, and
a `compare` mode whose entire job is to make the cross-engine differences visible.

## The interface

Every backend implements the same seven-method contract:

```ts
export interface SearchEngine {
  createIndex(name: string, schema: IndexSchema): Promise<void>;
  bulkIndex(index: string, docs: Document[]): Promise<BulkResult>;
  search(index: string, query: Query, opts?: SearchOptions): Promise<SearchResult>;
  suggest(index: string, request: SuggestRequest): Promise<SuggestResult>;
  explain(index: string, query: Query, docId: string): Promise<ExplainResult>;
  deleteDocs(index: string, ids: string[]): Promise<void>;
  dropIndex(name: string): Promise<void>;
}
```

The CLI and the comparison logic depend only on this interface, never on a concrete engine.

## The unified Query DSL

A neutral, engine-agnostic query that each adapter translates into native form:

```ts
const query: Query = {
  where: {
    type: 'bool',
    must: [{ type: 'match', field: 'title', value: 'table lamp' }],
    filter: [{ type: 'range', field: 'price', lte: 50 }],
  },
  sort: [{ field: 'price', order: 'asc' }],
  size: 10,
  highlight: { fields: ['title', 'description'] },
};
```

Primitives: `match` (full-text), `term` (exact), `bool` (must / should / must_not / filter),
`range`, plus `sort`, `from` / `size` paging and `highlight`.

## Autocomplete (`suggest`)

Prefix autocomplete with the same contract on every engine:

```ts
const result = await engine.suggest('products', { field: 'title', prefix: 'table la', size: 5 });
// result.suggestions → [{ text: 'Table lamp BORRE', score: 1.19 }, ...]
```

The last token is matched as a prefix and earlier tokens as whole words, so `"table la"`
completes to values like "Table lamp BORRE". Results are de-duplicated (several documents can
share a title) and ranked by the engine's relevance score.

It is implemented as prefix matching on an ordinary analyzed `text` field —
`match_phrase_prefix` on Elasticsearch/OpenSearch, `field:(+token +prefix*)` on Solr — rather
than the engines' native completion suggesters, which would each require a schema change (a
dedicated suggest field type) and behave differently per engine. One documented divergence
remains: ES/OS phrase-prefix requires the tokens in order and adjacent, while Solr's
translation is an AND of terms, so earlier-token order does not matter there.

## Facets

Terms and range facets with the same contract on every engine, riding on the search call
(one round-trip — counts always reflect the current query):

```ts
const result = await engine.search('products', {
  where: { type: 'match', field: 'title', value: 'lamp' },
  facets: [
    { type: 'terms', field: 'category' },
    {
      type: 'range',
      field: 'price',
      ranges: [
        { key: 'under-50', to: 50 },
        { key: '50-up', from: 50 },
      ],
    },
  ],
  postFilter: { type: 'term', field: 'category', value: 'lighting' },
});
// result.facets → [{ field: 'category', type: 'terms', buckets: [{ key: 'lighting', count: 4 }, ...] }, ...]
```

`postFilter` narrows the hits **without changing the facet counts** — post-filter
semantics, which is what makes a multi-select filter sidebar work (selecting a
category must not zero out the other categories). On Elasticsearch/OpenSearch this
is the native `post_filter`; on Solr it is a tagged filter query (`{!tag=pf}`)
that every facet excludes (`{!ex=pf}`) — same behaviour, two very different
mechanisms. Range buckets are from-inclusive / to-exclusive on every engine
(`[a TO b}` in Solr's bracket syntax, `from`/`to` in the ES range aggregation).

Facet on `keyword` (non-analyzed) fields: terms facets count indexed values, so an
analyzed `text` field would facet per token. The known refinement beyond this is
per-facet filter exclusion (each facet excluding only its own selections, so sibling
facets narrow while staying selectable); the post-filter design leaves room for it.

## Architecture

```
                 ┌────────────────────────────────┐
   CLI / compare │     SearchEngine interface     │   everything depends on THIS
                 │  createIndex bulkIndex search  │
                 │  suggest explain deleteDocs    │
                 │  dropIndex                     │
                 └───────────────┬────────────────┘
                                 │ implemented by
            ┌────────────────────┼─────────────────────┐
            ▼                    ▼                     ▼
     ElasticsearchAdapter   OpenSearchAdapter     SolrAdapter
            │                    │                     │
   @elastic/elasticsearch  @opensearch-project    native fetch (HTTP/JSON)
            │                    │                     │
            ▼                    ▼                     ▼
       ES container         OS container          Solr container
```

The Elasticsearch and OpenSearch adapters use their official clients; the Solr adapter talks to
Solr's HTTP/JSON API directly with `fetch`, so it has no third-party runtime dependency.

A unified `Query` is compiled by each adapter's translator into that engine's native query
language. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full design.

## Quickstart

```bash
# Spin up the engines locally (each engine has its own profile; `all` starts
# every engine, which is RAM-hungry).
docker compose --profile all up -d

npm install && npm run build

# Index the example corpus into each engine (the schema creates the index/core)
node dist/cli/index.js index --engine es   --index products \
  --file examples/products.ndjson --schema examples/schema.json
node dist/cli/index.js index --engine os   --index products \
  --file examples/products.ndjson --schema examples/schema.json
node dist/cli/index.js index --engine solr --index products \
  --file examples/products.ndjson --schema examples/schema.json

# Search one engine, then compare the same query across all three
node dist/cli/index.js search  --engine os --index products --q "table lamp"
node dist/cli/index.js compare --index products --q "table lamp" --engines es,os,solr

# Autocomplete a title prefix (the suggest API through the CLI)
node dist/cli/index.js suggest --engine es --index products --prefix "table la"
```

`compare` runs the same query across the engines and reports how they differ. It does not
compare raw scores (BM25 scores are not comparable across engines); it reports rank overlap and
each document's rank and score per engine:

```
Comparison across es, os, solr (top 10)

Top-K overlap (Jaccard):
  es vs os: 1.00
  es vs solr: 1.00
  os vs solr: 1.00
  shared by all: 1, 3, 5, 7, 2, 4, 6, 8

doc  es         os         solr
---  ---------  ---------  ---------
1    #1 (1.19)  #1 (1.19)  #1 (0.54)
3    #2 (0.69)  #2 (0.69)  #2 (0.32)
5    #3 (0.69)  #3 (0.69)  #3 (0.32)
7    #4 (0.69)  #4 (0.69)  #4 (0.32)
2    #5 (0.49)  #5 (0.49)  #5 (0.22)
4    #6 (0.49)  #6 (0.49)  #6 (0.22)
6    #7 (0.49)  #7 (0.49)  #7 (0.22)
8    #8 (0.49)  #8 (0.49)  #8 (0.22)
```

"Table lamp BORRE" (doc 1) is the only document matching both terms, so it leads on every
engine. Note the scores: Elasticsearch and OpenSearch agree (they share a query language), while
Solr's are roughly half, which is exactly why `compare` reports rank overlap and per-engine
placement rather than pretending the raw scores are equal. On this small, clean corpus the three
engines also agree on the ordering; on noisier real data the rankings diverge, and the table is
where you see it.

## Web UI

A small Next.js app under [`web/`](./web) lets you test everything in the browser: run one query
across all three engines and see the ranking differences, search a single engine with
highlights, filter with a multi-select facet sidebar, and explain a document's score. The browser talks only to server-side route handlers,
which use this library to reach the engines.

```bash
docker compose --profile all up -d   # engines
npm install && npm run build         # build the library the UI imports
cd web && npm install && npm run dev # then open http://localhost:3000
```

See [web/README.md](./web/README.md) for details.

## Development

Requires Node.js 22+.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest (unit)
npm run build       # tsup -> dist/
```

Integration tests run against local containers and are gated behind an env var:

```bash
docker compose --profile all up -d
npm run test:integration   # RUN_INTEGRATION=1 vitest run
```

## Roadmap

- [x] `SearchEngine` interface and unified Query DSL
- [x] Elasticsearch adapter + query translator (with integration tests)
- [x] OpenSearch adapter (shared query DSL; diverges only in client transport)
- [x] Solr adapter (its own `q`/`fq` query model and core/schema management)
- [x] `compare` mode: top-K overlap (Jaccard), per-document rank/score, readable table
- [x] CLI: `index`, `search`, `suggest`, `compare`, `explain`
- [x] docker-compose for all three engines + integration test suite
- [x] "Where the abstraction leaks" section, documenting the honest limits (see
      [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md))
- [x] Web UI (Next.js): search with highlights + inline explain, compare across engines
- [x] Autocomplete: `suggest` across all three engines, with a live dropdown in the web UI
- [x] Facets: terms + range facets with post-filter semantics, and a filter sidebar in the web UI

Out of scope for v1: semantic/vector search, synonyms, and cross-engine schema migration.

## License

MIT, see [LICENSE](./LICENSE).
