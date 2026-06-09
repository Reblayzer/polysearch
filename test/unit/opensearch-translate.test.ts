import { describe, it, expect } from 'vitest';
import * as es from '../../src/query/elasticsearch';
import * as os from '../../src/query/opensearch';
import type { Query } from '../../src/query/types';

/**
 * OpenSearch forked Elasticsearch 7.10, so for the primitives polysearch
 * supports the query DSL is identical and the translator is shared. These tests
 * pin that contract: the OpenSearch translator must produce exactly the same
 * body as the Elasticsearch one. If they ever need to diverge, this test is the
 * tripwire that says so.
 */
describe('OpenSearch translator (shared with Elasticsearch)', () => {
  it('produces the same search body as the Elasticsearch translator', () => {
    const query: Query = {
      where: {
        type: 'bool',
        must: [{ type: 'match', field: 'title', value: 'table lamp' }],
        should: [{ type: 'match', field: 'description', value: 'oak' }],
        mustNot: [{ type: 'term', field: 'discontinued', value: true }],
        filter: [{ type: 'range', field: 'price', lte: 50 }],
      },
      sort: [{ field: 'price', order: 'asc' }],
      from: 0,
      size: 5,
      highlight: { fields: ['title', 'description'] },
    };

    expect(os.buildSearchBody(query)).toEqual(es.buildSearchBody(query));
  });

  it('re-exports translateClause with identical output', () => {
    const clause = { type: 'term', field: 'category', value: 'lighting' } as const;
    expect(os.translateClause(clause)).toEqual(es.translateClause(clause));
  });

  it('re-exports buildSuggestBody with identical output', () => {
    const request = { field: 'title', prefix: 'table la', size: 5 };
    expect(os.buildSuggestBody(request)).toEqual(es.buildSuggestBody(request));
  });
});
