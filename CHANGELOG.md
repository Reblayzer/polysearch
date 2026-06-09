# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-09

First release. One interface across three search engines, plus a comparison mode and a CLI.

### Added

- Unified `SearchEngine` interface and a neutral Query DSL (`match`, `term`, `bool`, `range`,
  plus `sort`, `from`/`size` paging and `highlight`).
- **Elasticsearch** adapter with its own query translator.
- **OpenSearch** adapter sharing the Elasticsearch translator (OpenSearch forked Elasticsearch
  7.10), with the client-transport differences handled in the adapter.
- **Solr** adapter with its own translator (`q` + `fq` parameters), talking to Solr's HTTP/JSON
  API directly via native `fetch` (no third-party client).
- `compare` mode: run one query across several engines and report top-K overlap (Jaccard) and
  each document's rank and score per engine, deliberately not raw score equality.
- CLI (`polysearch`): `index`, `search`, `compare`, `explain`.
- `docker-compose` for all three engines behind per-engine profiles, and an `RUN_INTEGRATION`
  gated integration test suite.
- Documentation: `README`, `docs/ARCHITECTURE.md` (including a "where the abstraction leaks"
  section), and a worked retail-style example under `examples/`.

### Out of scope for this release

Semantic/vector search, facets/aggregations beyond top-K, autocomplete and synonyms,
cross-engine schema migration, and a web UI for the comparison output.

[0.1.0]: https://github.com/Reblayzer/polysearch/releases/tag/v0.1.0
