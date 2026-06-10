/**
 * polysearch CLI: a thin commander layer over the library.
 *
 * Four commands matching the kind of Node tooling a search team builds: index,
 * search, compare, explain. `--q` runs a simple match on `--field` (default
 * title); the full Query DSL is the library's job, the CLI exposes the common
 * case. Each engine has a sensible default node URL, overridable with a flag.
 */
import { readFileSync } from 'node:fs';
import pkg from '../../package.json' with { type: 'json' };
import { Command } from 'commander';
import { compare, createEngine, formatComparison } from '../index';
import type { EngineName, NamedEngine, Query, SearchEngine } from '../index';
import { parseDocuments, parseSchema } from './parse';

const DEFAULT_NODES: Record<EngineName, string> = {
  elasticsearch: 'http://localhost:9200',
  opensearch: 'http://localhost:9201',
  solr: 'http://localhost:8983/solr',
};

const ENGINE_ALIASES: Record<string, EngineName> = {
  es: 'elasticsearch',
  elasticsearch: 'elasticsearch',
  os: 'opensearch',
  opensearch: 'opensearch',
  solr: 'solr',
};

interface IndexOptions {
  engine: string;
  index: string;
  file: string;
  schema?: string;
  node?: string;
}
interface SearchOptions {
  engine: string;
  index: string;
  q: string;
  field: string;
  size: string;
  node?: string;
}
interface CompareOptions {
  index: string;
  q: string;
  field: string;
  engines: string;
  size: string;
  esNode?: string;
  osNode?: string;
  solrNode?: string;
}
interface ExplainOptions {
  engine: string;
  index: string;
  q: string;
  field: string;
  doc: string;
  node?: string;
}

function makeEngine(alias: string, nodeOverride?: string): SearchEngine {
  const engineName = ENGINE_ALIASES[alias];
  if (!engineName) throw new Error(`unknown engine "${alias}" (use es, os, or solr)`);
  return createEngine(engineName, { node: nodeOverride ?? DEFAULT_NODES[engineName] });
}

function matchQuery(field: string, value: string, size: number): Query {
  return { where: { type: 'match', field, value }, size };
}

function summarize(source: Record<string, unknown>): string {
  return typeof source.title === 'string' ? source.title : JSON.stringify(source);
}

const program = new Command();
program
  .name('polysearch')
  .description('One interface across Elasticsearch, OpenSearch and Solr')
  .version(pkg.version);

program
  .command('index')
  .description('Bulk-index documents from an NDJSON file')
  .requiredOption('--engine <engine>', 'es | os | solr')
  .requiredOption('--index <name>', 'index or core name')
  .requiredOption('--file <path>', 'NDJSON file, one JSON document per line')
  .option('--schema <path>', 'JSON schema file; if given, the index is created first')
  .option('--node <url>', 'override the engine node URL')
  .action(async (options: IndexOptions) => {
    const engine = makeEngine(options.engine, options.node);
    if (options.schema !== undefined) {
      await engine.createIndex(options.index, parseSchema(readFileSync(options.schema, 'utf8')));
    }
    const documents = parseDocuments(readFileSync(options.file, 'utf8'));
    const result = await engine.bulkIndex(options.index, documents);
    console.log(`indexed ${result.indexed} document(s), ${result.errors.length} error(s)`);
    for (const error of result.errors) console.log(`  ${error.id}: ${error.reason}`);
  });

program
  .command('search')
  .description('Search one engine with a simple match query')
  .requiredOption('--engine <engine>', 'es | os | solr')
  .requiredOption('--index <name>', 'index or core name')
  .requiredOption('--q <text>', 'query text')
  .option('--field <field>', 'field to match against', 'title')
  .option('--size <n>', 'number of results', '10')
  .option('--node <url>', 'override the engine node URL')
  .action(async (options: SearchOptions) => {
    const engine = makeEngine(options.engine, options.node);
    const result = await engine.search(
      options.index,
      matchQuery(options.field, options.q, Number(options.size)),
    );
    console.log(`${result.total} hit(s) in ${result.tookMs}ms`);
    result.hits.forEach((hit, i) => {
      console.log(`  #${i + 1} ${hit.id}  score=${hit.score.toFixed(2)}  ${summarize(hit.source)}`);
    });
  });

program
  .command('compare')
  .description('Run one query across several engines and report the differences')
  .requiredOption('--index <name>', 'index or core name (must match across engines)')
  .requiredOption('--q <text>', 'query text')
  .option('--engines <list>', 'comma-separated engines', 'es,os,solr')
  .option('--field <field>', 'field to match against', 'title')
  .option('--size <n>', 'top-K size', '10')
  .option('--es-node <url>', 'override the Elasticsearch node URL')
  .option('--os-node <url>', 'override the OpenSearch node URL')
  .option('--solr-node <url>', 'override the Solr node URL')
  .action(async (options: CompareOptions) => {
    const overrides: Record<string, string | undefined> = {
      es: options.esNode,
      os: options.osNode,
      solr: options.solrNode,
    };
    const engines: NamedEngine[] = options.engines
      .split(',')
      .map((alias) => alias.trim())
      .filter((alias) => alias.length > 0)
      .map((alias) => ({ name: alias, engine: makeEngine(alias, overrides[alias]) }));

    const size = Number(options.size);
    const result = await compare(
      engines,
      options.index,
      matchQuery(options.field, options.q, size),
      size,
    );
    console.log(formatComparison(result));
  });

program
  .command('explain')
  .description('Explain how one document scored against a query')
  .requiredOption('--engine <engine>', 'es | os | solr')
  .requiredOption('--index <name>', 'index or core name')
  .requiredOption('--q <text>', 'query text')
  .requiredOption('--doc <id>', 'document id to explain')
  .option('--field <field>', 'field to match against', 'title')
  .option('--node <url>', 'override the engine node URL')
  .action(async (options: ExplainOptions) => {
    const engine = makeEngine(options.engine, options.node);
    const result = await engine.explain(
      options.index,
      matchQuery(options.field, options.q, 10),
      options.doc,
    );
    console.log(`matched: ${result.matched}  score: ${result.score.toFixed(2)}`);
    if (result.detail) console.log(result.detail);
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
