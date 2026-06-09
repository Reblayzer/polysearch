/**
 * Integration tests for the Elasticsearch adapter, against a real container.
 *
 * Gated behind RUN_INTEGRATION=1 (set by `npm run test:integration`). When the
 * flag is absent the whole suite is skipped, so the default `npm test` and CI
 * need no engine. Start the engine first: `docker compose --profile es up -d`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ElasticsearchAdapter } from '../../src/engines/elasticsearch';
import type { Document, IndexSchema } from '../../src/types';

const RUN = process.env.RUN_INTEGRATION === '1';
const NODE = process.env.ES_NODE ?? 'http://localhost:9200';
const INDEX = 'polysearch-it-products';

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
  {
    id: '1',
    title: 'Table lamp BORRE',
    description: 'Warm oak table lamp, perfect on a side table',
    category: 'lighting',
    price: 39,
    discontinued: false,
  },
  {
    id: '2',
    title: 'Desk lamp NEX',
    description: 'Adjustable LED desk lamp',
    category: 'lighting',
    price: 25,
    discontinued: false,
  },
  {
    id: '3',
    title: 'Oak dining table',
    description: 'Solid oak table that seats six',
    category: 'tables',
    price: 299,
    discontinued: false,
  },
  {
    id: '4',
    title: 'Floor lamp HALDEN',
    description: 'Tall floor lamp from a discontinued line',
    category: 'lighting',
    price: 59,
    discontinued: true,
  },
];

describe.skipIf(!RUN)('ElasticsearchAdapter (integration)', () => {
  const engine = new ElasticsearchAdapter({ node: NODE });

  beforeAll(async () => {
    await engine.dropIndex(INDEX);
    await engine.createIndex(INDEX, schema);
    const result = await engine.bulkIndex(INDEX, products);
    expect(result.indexed).toBe(products.length);
    expect(result.errors).toEqual([]);
  });

  afterAll(async () => {
    await engine.dropIndex(INDEX);
    await engine.close();
  });

  it('ranks a full-text match by relevance', async () => {
    const res = await engine.search(INDEX, {
      where: { type: 'match', field: 'title', value: 'table lamp' },
      size: 10,
    });
    expect(res.total).toBeGreaterThan(0);
    // "Table lamp BORRE" matches both terms in the title, so it ranks first.
    expect(res.hits[0]?.id).toBe('1');
    expect(res.hits[0]?.score).toBeGreaterThan(0);
  });

  it('uses filter and must_not without distorting the matched set', async () => {
    const res = await engine.search(INDEX, {
      where: {
        type: 'bool',
        must: [{ type: 'match', field: 'title', value: 'lamp' }],
        filter: [{ type: 'range', field: 'price', lte: 40 }],
        mustNot: [{ type: 'term', field: 'discontinued', value: true }],
      },
      size: 10,
    });
    const ids = res.hits.map((h) => h.id).sort();
    // Lamps priced <= 40 and not discontinued: id 1 (39) and id 2 (25).
    expect(ids).toEqual(['1', '2']);
  });

  it('returns highlights when requested', async () => {
    const res = await engine.search(INDEX, {
      where: { type: 'match', field: 'description', value: 'oak' },
      highlight: { fields: ['description'] },
      size: 10,
    });
    expect(res.hits[0]?.highlights?.description?.[0]).toContain('<em>');
  });

  it('explains how a document scored', async () => {
    const res = await engine.explain(
      INDEX,
      { where: { type: 'match', field: 'title', value: 'lamp' } },
      '1',
    );
    expect(res.matched).toBe(true);
    expect(res.score).toBeGreaterThan(0);
    expect(res.detail.length).toBeGreaterThan(0);
  });

  it('deletes documents by id', async () => {
    await engine.deleteDocs(INDEX, ['2']);
    const res = await engine.search(INDEX, {
      where: { type: 'term', field: 'category', value: 'lighting' },
      size: 10,
    });
    expect(res.hits.map((h) => h.id)).not.toContain('2');
  });
});
