# polysearch

[![CI](https://github.com/Reblayzer/polysearch/actions/workflows/ci.yml/badge.svg)](https://github.com/Reblayzer/polysearch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

One `SearchEngine` interface across **Elasticsearch**, **OpenSearch** and **Solr**, a small
unified Query DSL that compiles to each engine's native query, and a comparison mode that runs
the same query across all three engines and reports the scoring and result-set differences.

> **Status: in active development.** The interface, the unified Query DSL and all three engine
> adapters (**Elasticsearch, OpenSearch, Solr**, with integration tests) are in place. The
> comparison mode and the CLI are landing next (see [Roadmap](#roadmap)). The `main` branch is
> kept green.

## Why

Elasticsearch, OpenSearch and Solr are all built on Apache Lucene and all score with BM25, yet
the same query over the same data does not produce identical rankings across them: their
defaults, tokenisation and tie-breaking differ. Existing universal clients tend to target a
single backend, or hide so much of each engine that those differences disappear.

polysearch keeps the abstraction thin on purpose. It gives you one way to index and query, and
a `compare` mode whose entire job is to make the cross-engine differences visible.

## The interface

Every backend implements the same six-method contract:

```ts
export interface SearchEngine {
  createIndex(name: string, schema: IndexSchema): Promise<void>;
  bulkIndex(index: string, docs: Document[]): Promise<BulkResult>;
  search(index: string, query: Query, opts?: SearchOptions): Promise<SearchResult>;
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

## Architecture

```
                 ┌─────────────────────────────┐
   CLI / compare │     SearchEngine interface   │   everything depends on THIS
                 │  createIndex bulkIndex search │
                 │   explain deleteDocs dropIndex│
                 └───────────────┬──────────────┘
                                 │ implemented by
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                     ▼
     ElasticsearchAdapter   OpenSearchAdapter     SolrAdapter
            │                    │                     │
   @elastic/elasticsearch  @opensearch-project    solr-client
            │                    │                     │
            ▼                    ▼                     ▼
       ES container         OS container          Solr container
```

A unified `Query` is compiled by each adapter's translator into that engine's native query
language. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full design.

## Quickstart

> All three engine adapters work today. The `index` and `search` operations are real; the
> `compare` command lands next. This shows the intended CLI shape.

```bash
# Spin up the engines locally (each engine has its own profile; `all` starts
# every engine, which is RAM-hungry). Examples:
docker compose --profile es up -d     # Elasticsearch only
docker compose --profile all up -d    # all engines

# Index a product corpus, search one engine, compare all three
polysearch index   --engine es   --index products --file products.ndjson
polysearch search  --engine os   --index products --q "table lamp"
polysearch compare --index products --q "table lamp" --engines es,os,solr
```

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
- [ ] `compare` mode: top-K overlap, score deltas, human-readable summary
- [ ] CLI: `index`, `search`, `compare`, `explain`
- [ ] docker-compose for all three engines + integration test suite
- [ ] "Where the abstraction leaks" section, documenting the honest limits

Out of scope for v1: semantic/vector search, facets/aggregations, autocomplete and synonyms,
cross-engine schema migration, and a web UI for the comparison output.

## License

MIT, see [LICENSE](./LICENSE).
