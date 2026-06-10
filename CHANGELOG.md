# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-06-10

The two intentional follow-ups from 0.5.0 — the CLI `suggest` command and the README
documentation for the suggest API — plus a stale-version fix.

### Added

- **CLI `suggest` command** — prefix autocomplete from the command line, mirroring the other
  commands: `polysearch suggest --engine es --index products --prefix "table la"` (`--field`
  defaults to `title`, `--size` to 10).
- **README**: the interface section now documents all seven methods (it still said six), a new
  "Autocomplete (`suggest`)" section explains the prefix-matching design and the
  Elasticsearch/OpenSearch-vs-Solr divergence, the architecture diagram and Quickstart include
  `suggest`, and the roadmap no longer lists shipped features (autocomplete, the web UI) as out
  of scope.

### Fixed

- **CLI `--version`** printed a hardcoded `0.1.0`. The version is now imported from
  `package.json` at build time (inlined by the bundler), so it cannot drift again.
- The lockfiles recorded stale package versions (`0.2.0` root, `0.4.0` in `web/`); synced.

[0.5.1]: https://github.com/Reblayzer/polysearch/releases/tag/v0.5.1

## [0.5.0] - 2026-06-09

Prefix-based autocomplete (`suggest`) across all three engines, plus a live as-you-type
dropdown in the web UI.

### Added

- **`SearchEngine.suggest(index, request)`** — autocomplete a `text` field by prefix and return
  ranked, de-duplicated completions (`SuggestRequest`, `Suggestion`, `SuggestResult`). The last
  whitespace-separated token is matched as a prefix, earlier tokens as whole words, so `"table la"`
  suggests `"Table lamp BORRE"`. An empty or whitespace-only prefix returns no suggestions without
  a round-trip.
- **Engine translators**: `buildSuggestBody` for the Elasticsearch family (a `match_phrase_prefix`
  query narrowed to the completed field via `_source`), shared by OpenSearch; `toSolrSuggest` for
  Solr (`field:(+token +prefix*)` in Lucene syntax). Both are pure and unit-tested.
- **Web UI**: a debounced as-you-type suggestions dropdown under the search box, backed by a new
  `/api/suggest` route handler.

### Notes

- **Documented divergence**: Elasticsearch/OpenSearch `match_phrase_prefix` requires the tokens to
  be adjacent and in order; Solr's `+a +b*` only requires both to be present (an AND, not a
  phrase). The practical autocomplete results match; exact phrase semantics on Solr would need the
  heavier `{!complexphrase}` parser. This is recorded at the call site, in the same spirit as the
  existing `minimumShouldMatch` leak.
- Implemented with prefix matching rather than native completion suggesters (the Elasticsearch/
  OpenSearch `completion` field type and Solr's suggester component) so it works on existing
  indexes with no schema changes and stays consistent across all three engines.
- The CLI does not yet expose a `suggest` command, and the `README` does not yet document the
  `suggest` API; both are intentional follow-ups.

[0.5.0]: https://github.com/Reblayzer/polysearch/releases/tag/v0.5.0

## [0.4.0] - 2026-06-09

Remove the OpenSearch request-body casts by emitting a neutral compiled-query type.

### Changed

- The query translator now emits a neutral compiled-query shape (`src/query/compiled.ts`)
  designed to be assignable to both the Elasticsearch and OpenSearch clients, so **request bodies
  no longer need a cast on either engine** (the `toOsBody` helper is gone). The only remaining
  type assertion is on the response side, reading hits through a corrected local shape because the
  OpenSearch client's generated hit type is malformed in the pinned version (a genuine upstream
  bug).
- **Breaking (types):** `RangeQuery` bounds are now `number` instead of `number | string` (for
  date fields, use epoch milliseconds). This is what lets the compiled range unify across engines
  without a cast, since OpenSearch's generated `RangeQuery` is a strict number-or-date union with
  no untyped variant.

[0.4.0]: https://github.com/Reblayzer/polysearch/releases/tag/v0.4.0

## [0.3.0] - 2026-06-09

Configurable timeouts, a coverage threshold, and integration tests in CI.

### Added

- **Configurable, consistent timeouts.** `EngineConfig.timeoutMs` sets the default client-side
  request timeout for any adapter (Solr previously hardcoded 30s). A per-search
  `SearchOptions.timeoutMs` now also bounds the wait on the client side for Elasticsearch and
  OpenSearch (via the client `requestTimeout`), not just as a server hint, so timeout behaviour
  is consistent across all three adapters.
- **Test coverage threshold.** `npm run test:coverage` enforces coverage thresholds on the pure,
  unit-tested logic (translators, compare maths, errors, validation); the engine adapters and CLI
  wiring are excluded because they are covered by the integration tests.
- **Integration tests in CI.** The Elasticsearch and OpenSearch integration tests now run in CI
  against service containers. Solr's stays local (it needs the `_default` configset bind-mounted),
  as does the cross-engine compare test (it needs all three engines).

[0.3.0]: https://github.com/Reblayzer/polysearch/releases/tag/v0.3.0

## [0.2.0] - 2026-06-09

Best-practices pass: typed errors, input validation, and accurate per-engine auth.

### Added

- **Elasticsearch API-key auth.** `EngineConfig.apiKey` is preferred over basic auth on the
  Elasticsearch adapter (API keys are Elasticsearch's native scoped, revocable service auth). It
  is ignored by OpenSearch and Solr, which have no native API-key concept (OpenSearch also
  supports AWS SigV4, not wired here). This corrects a docs claim that previously overstated
  auth support.
- **Typed errors** (`src/errors.ts`): every error polysearch throws now extends `PolysearchError`
  (`FieldValidationError`, `EngineRequestError` with a `statusCode`, `TimeoutError`), so callers
  can discriminate by type instead of string-matching messages.
- **CLI input validation** (`src/cli/parse.ts`): schema and document files are validated at the
  boundary with clear errors and line numbers, instead of unchecked `as` type assertions.

[0.2.0]: https://github.com/Reblayzer/polysearch/releases/tag/v0.2.0

## [0.1.1] - 2026-06-09

Security and robustness hardening, from an adversarial review of the codebase.

### Fixed

- **Query injection**: field names are now validated across all engines
  (`src/query/field.ts`), closing a Lucene query-injection vector in the Solr translator, where
  field names were interpolated into the query string (values were already escaped). Field names
  are restricted to a conservative identifier pattern and rejected everywhere if invalid.

### Added

- A client-side request timeout on the Solr adapter (`AbortSignal.timeout`), so a hung connection
  can no longer hang the caller.

### Changed

- `compare` now uses `Promise.allSettled`: one unreachable engine no longer fails the whole
  comparison. The engines that responded are compared, and the rest are reported in a new
  `failures` field on `ComparisonResult` (and printed by `formatComparison`).

[0.1.1]: https://github.com/Reblayzer/polysearch/releases/tag/v0.1.1

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
