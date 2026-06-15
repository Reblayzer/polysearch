# PolySearch web UI

A small Next.js app for testing PolySearch in the browser: run one query across
Elasticsearch, OpenSearch and Solr and see how their rankings differ, search a
single engine, and inspect why a document scored the way it did.

## Architecture

The browser never talks to the engines directly (no CORS, and you would expose
credentials). Instead:

```
browser  ──fetch──>  Next.js route handlers (/api/*)  ──>  PolySearch library  ──>  engines
```

The route handlers (`app/api/*`) run server-side and use the `polysearch`
library (a local `file:..` dependency) to reach the engines. The engine clients
are kept server-external in `next.config.ts`.

## Run it

From the repository root, start the engines and build the library:

```bash
docker compose --profile all up -d   # Elasticsearch, OpenSearch, Solr
npm install && npm run build         # build the PolySearch library (the UI imports its dist)
```

Then start the web app:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 (it picks the next free port, e.g. 3001, if 3000 is
busy). Click **Seed example data** to index the sample corpus into all three
engines, then:

- **Compare** runs the same query across the selected engines and shows the
  top-K overlap (Jaccard) and each document's rank and score per engine.
- **Search** queries a single engine and shows hits with highlights; click
  **explain** on a hit to see how it scored.

Engine URLs default to the docker-compose ports and can be overridden with the
`ES_NODE`, `OS_NODE` and `SOLR_NODE` environment variables.
