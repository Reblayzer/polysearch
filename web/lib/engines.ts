/**
 * Server-only: build polysearch engine adapters from env-configured node URLs.
 * This module (and the API route handlers that use it) are the only place that
 * talks to the engines; the browser only ever calls our /api routes.
 */
import 'server-only';
import { createEngine, type EngineName, type NamedEngine, type SearchEngine } from 'polysearch';

const DEFAULT_NODES: Record<EngineName, string> = {
  elasticsearch: process.env.ES_NODE ?? 'http://localhost:9200',
  opensearch: process.env.OS_NODE ?? 'http://localhost:9201',
  solr: process.env.SOLR_NODE ?? 'http://localhost:8983/solr',
};

const ALIASES: Record<string, EngineName> = {
  es: 'elasticsearch',
  elasticsearch: 'elasticsearch',
  os: 'opensearch',
  opensearch: 'opensearch',
  solr: 'solr',
};

/** Short keys the UI uses, in display order. */
export const ENGINE_KEYS = ['es', 'os', 'solr'] as const;
export type EngineKey = (typeof ENGINE_KEYS)[number];

export const ENGINE_LABELS: Record<EngineKey, string> = {
  es: 'Elasticsearch',
  os: 'OpenSearch',
  solr: 'Solr',
};

export function engineFor(key: string): SearchEngine {
  const name = ALIASES[key];
  if (!name) throw new Error(`unknown engine "${key}" (use es, os or solr)`);
  return createEngine(name, { node: DEFAULT_NODES[name], timeoutMs: 5000 });
}

export function namedEngines(keys: string[]): NamedEngine[] {
  return keys.map((key) => ({ name: key, engine: engineFor(key) }));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
