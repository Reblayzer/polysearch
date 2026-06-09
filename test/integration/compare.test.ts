/**
 * Integration test for compare mode: index the same corpus into all three
 * engines, run one query across them, and check the comparison holds together.
 *
 * Gated behind RUN_INTEGRATION=1. Needs all three engines:
 *   docker compose --profile all up -d
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ElasticsearchAdapter } from '../../src/engines/elasticsearch';
import { OpenSearchAdapter } from '../../src/engines/opensearch';
import { SolrAdapter } from '../../src/engines/solr';
import { compare, type NamedEngine } from '../../src/compare';
import type { Document, IndexSchema } from '../../src/types';

const RUN = process.env.RUN_INTEGRATION === '1';
const INDEX = 'polysearch_it_compare';

const schema: IndexSchema = {
  fields: {
    title: { type: 'text' },
    description: { type: 'text' },
    category: { type: 'keyword' },
    price: { type: 'float' },
    discontinued: { type: 'boolean' },
  },
};

const products: Document[] = [
  { id: '1', title: 'Table lamp BORRE', category: 'lighting', price: 39 },
  { id: '2', title: 'Desk lamp NEX', category: 'lighting', price: 25 },
  { id: '3', title: 'Oak dining table', category: 'tables', price: 299 },
  { id: '4', title: 'Floor lamp HALDEN', category: 'lighting', price: 59 },
  { id: '5', title: 'Coffee table SVAL', category: 'tables', price: 149 },
];

const es = new ElasticsearchAdapter({ node: process.env.ES_NODE ?? 'http://localhost:9200' });
const os = new OpenSearchAdapter({ node: process.env.OS_NODE ?? 'http://localhost:9201' });
const solr = new SolrAdapter({ node: process.env.SOLR_NODE ?? 'http://localhost:8983/solr' });

const engines: NamedEngine[] = [
  { name: 'es', engine: es },
  { name: 'os', engine: os },
  { name: 'solr', engine: solr },
];

describe.skipIf(!RUN)('compare across all three engines (integration)', () => {
  beforeAll(async () => {
    for (const { engine } of engines) {
      await engine.dropIndex(INDEX);
      await engine.createIndex(INDEX, schema);
      await engine.bulkIndex(INDEX, products);
    }
  });

  afterAll(async () => {
    await es.dropIndex(INDEX);
    await os.dropIndex(INDEX);
    await solr.dropIndex(INDEX);
    await Promise.all([es.close(), os.close(), solr.close()]);
  });

  it('runs one query across engines and agrees on the strongest match', async () => {
    const result = await compare(
      engines,
      INDEX,
      { where: { type: 'match', field: 'title', value: 'table lamp' } },
      10,
    );

    expect(result.engines).toEqual(['es', 'os', 'solr']);
    expect(result.documents.length).toBeGreaterThan(0);

    // "Table lamp BORRE" is the only document with both terms in its title, so
    // every engine should rank it first.
    const top = result.documents.find((d) => d.id === '1');
    expect(top?.presentInAll).toBe(true);
    expect(top?.perEngine.es?.rank).toBe(1);
    expect(top?.perEngine.os?.rank).toBe(1);
    expect(top?.perEngine.solr?.rank).toBe(1);
    expect(result.overlap.sharedByAll).toContain('1');
  });

  it('reports Jaccard overlaps within [0, 1]', async () => {
    const result = await compare(
      engines,
      INDEX,
      { where: { type: 'match', field: 'title', value: 'lamp' } },
      10,
    );
    for (const value of Object.values(result.overlap.pairwiseJaccard)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // Elasticsearch and OpenSearch share a query language and analyzer defaults,
    // so on this corpus their top-K sets are identical.
    expect(result.overlap.pairwiseJaccard['es|os']).toBe(1);
  });
});
