import { describe, it, expect } from 'vitest';
import { buildSearchBody, translateClause } from '../../src/query/elasticsearch';
import type { Query } from '../../src/query/types';

describe('Elasticsearch translator: clauses', () => {
  it('translates a match clause', () => {
    expect(translateClause({ type: 'match', field: 'title', value: 'table lamp' })).toEqual({
      match: { title: { query: 'table lamp' } },
    });
  });

  it('translates a term clause', () => {
    expect(translateClause({ type: 'term', field: 'category', value: 'lighting' })).toEqual({
      term: { category: { value: 'lighting' } },
    });
  });

  it('translates a range clause with only the bounds that are set', () => {
    expect(translateClause({ type: 'range', field: 'price', lte: 50 })).toEqual({
      range: { price: { lte: 50 } },
    });
    expect(translateClause({ type: 'range', field: 'price', gte: 10, lt: 100 })).toEqual({
      range: { price: { gte: 10, lt: 100 } },
    });
  });

  it('translates a bool clause, renaming mustNot and minimumShouldMatch', () => {
    const result = translateClause({
      type: 'bool',
      must: [{ type: 'match', field: 'title', value: 'lamp' }],
      should: [{ type: 'match', field: 'description', value: 'oak' }],
      mustNot: [{ type: 'term', field: 'discontinued', value: true }],
      filter: [{ type: 'range', field: 'price', lte: 50 }],
      minimumShouldMatch: 1,
    });

    expect(result).toEqual({
      bool: {
        must: [{ match: { title: { query: 'lamp' } } }],
        should: [{ match: { description: { query: 'oak' } } }],
        must_not: [{ term: { discontinued: { value: true } } }],
        filter: [{ range: { price: { lte: 50 } } }],
        minimum_should_match: 1,
      },
    });
  });

  it('translates nested bool clauses recursively', () => {
    const result = translateClause({
      type: 'bool',
      must: [
        {
          type: 'bool',
          should: [
            { type: 'match', field: 'title', value: 'lamp' },
            { type: 'match', field: 'title', value: 'light' },
          ],
        },
      ],
    });

    expect(result).toEqual({
      bool: {
        must: [
          {
            bool: {
              should: [
                { match: { title: { query: 'lamp' } } },
                { match: { title: { query: 'light' } } },
              ],
            },
          },
        ],
      },
    });
  });
});

describe('Elasticsearch translator: full search body', () => {
  it('maps from, size, sort and highlight into the ES shapes', () => {
    const query: Query = {
      where: { type: 'match', field: 'title', value: 'table lamp' },
      from: 20,
      size: 10,
      sort: [{ field: 'price', order: 'asc' }],
      highlight: { fields: ['title', 'description'], preTag: '<b>', postTag: '</b>' },
    };

    expect(buildSearchBody(query)).toEqual({
      query: { match: { title: { query: 'table lamp' } } },
      from: 20,
      size: 10,
      sort: [{ price: { order: 'asc' } }],
      highlight: {
        fields: { title: {}, description: {} },
        pre_tags: ['<b>'],
        post_tags: ['</b>'],
      },
    });
  });

  it('omits paging, sort and highlight when not provided', () => {
    const body = buildSearchBody({ where: { type: 'term', field: 'id', value: '12' } });
    expect(body).toEqual({ query: { term: { id: { value: '12' } } } });
  });
});
