import { describe, it, expect } from 'vitest';
import {
  buildComparison,
  compare,
  formatComparison,
  jaccard,
  type EngineResult,
} from '../../src/compare';
import type { SearchEngine } from '../../src/engine';

/** A SearchEngine whose `search` is supplied; the rest are inert stubs. */
function stubEngine(search: SearchEngine['search']): SearchEngine {
  return {
    search,
    suggest: () => Promise.resolve({ suggestions: [] }),
    createIndex: () => Promise.resolve(),
    bulkIndex: () => Promise.resolve({ indexed: 0, errors: [] }),
    explain: () => Promise.resolve({ id: '', matched: false, score: 0, detail: '' }),
    deleteDocs: () => Promise.resolve(),
    dropIndex: () => Promise.resolve(),
  };
}

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('computes intersection over union', () => {
    // {1,2,3} vs {1,2,3,8,9}: intersection 3, union 5 -> 0.6
    expect(jaccard(new Set(['1', '2', '3']), new Set(['1', '2', '3', '8', '9']))).toBeCloseTo(0.6);
  });

  it('treats two empty sets as identical', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
  });
});

describe('buildComparison', () => {
  const perEngine: EngineResult[] = [
    {
      engine: 'es',
      total: 3,
      hits: [
        { id: '1', score: 8.4, rank: 1 },
        { id: '2', score: 5.1, rank: 2 },
        { id: '3', score: 2.0, rank: 3 },
      ],
    },
    {
      engine: 'solr',
      total: 3,
      hits: [
        { id: '2', score: 9.0, rank: 1 },
        { id: '1', score: 7.2, rank: 2 },
        { id: '9', score: 1.1, rank: 3 },
      ],
    },
  ];

  it('builds per-document placement and flags shared documents', () => {
    const result = buildComparison(perEngine, 3);

    const doc1 = result.documents.find((d) => d.id === '1');
    expect(doc1?.perEngine.es).toEqual({ rank: 1, score: 8.4 });
    expect(doc1?.perEngine.solr).toEqual({ rank: 2, score: 7.2 });
    expect(doc1?.presentInAll).toBe(true);

    const doc3 = result.documents.find((d) => d.id === '3');
    expect(doc3?.perEngine.es).toEqual({ rank: 3, score: 2.0 });
    expect(doc3?.perEngine.solr).toBeNull();
    expect(doc3?.presentInAll).toBe(false);
  });

  it('reports shared-by-all and pairwise Jaccard', () => {
    const result = buildComparison(perEngine, 3);
    // ids 1 and 2 are in both; 3 only in es, 9 only in solr.
    expect(result.overlap.sharedByAll.sort()).toEqual(['1', '2']);
    // {1,2,3} vs {1,2,9}: intersection 2, union 4 -> 0.5
    expect(result.overlap.pairwiseJaccard['es|solr']).toBeCloseTo(0.5);
  });

  it('sorts documents by best rank achieved on any engine', () => {
    const result = buildComparison(perEngine, 3);
    // doc 1 (best rank 1) and doc 2 (best rank 1) lead; ties broken by id.
    expect(result.documents.map((d) => d.id)).toEqual(['1', '2', '3', '9']);
  });
});

describe('compare graceful degradation', () => {
  const query = { where: { type: 'match', field: 'title', value: 'lamp' } } as const;

  it('proceeds with responding engines and records the failures', async () => {
    const good = stubEngine(() =>
      Promise.resolve({
        total: 1,
        tookMs: 1,
        hits: [{ id: '1', score: 1.2, source: {} }],
      }),
    );
    const bad = stubEngine(() => {
      throw new Error('connection refused');
    });

    const result = await compare(
      [
        { name: 'es', engine: good },
        { name: 'solr', engine: bad },
      ],
      'products',
      query,
    );

    expect(result.engines).toEqual(['es']);
    expect(result.failures).toEqual([{ engine: 'solr', error: 'connection refused' }]);
    expect(result.documents.map((d) => d.id)).toContain('1');
    expect(formatComparison(result)).toContain('Engines that did not respond');
  });

  it('carries failures through buildComparison', () => {
    const result = buildComparison(
      [{ engine: 'es', total: 1, hits: [{ id: '1', score: 1, rank: 1 }] }],
      5,
      [{ engine: 'solr', error: 'down' }],
    );
    expect(result.failures).toEqual([{ engine: 'solr', error: 'down' }]);
  });
});

describe('formatComparison', () => {
  it('renders a readable table containing the engines and a doc row', () => {
    const result = buildComparison(
      [
        { engine: 'es', total: 1, hits: [{ id: '1', score: 8.4, rank: 1 }] },
        { engine: 'solr', total: 1, hits: [{ id: '1', score: 7.2, rank: 1 }] },
      ],
      5,
    );
    const text = formatComparison(result);
    expect(text).toContain('Comparison across es, solr');
    expect(text).toContain('es vs solr');
    expect(text).toContain('#1 (8.40)');
  });
});
