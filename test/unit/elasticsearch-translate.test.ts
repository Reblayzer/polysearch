import { describe, it, expect } from 'vitest';
import {
  buildSearchBody,
  buildSuggestBody,
  translateClause,
  parseAggregations,
} from '../../src/query/elasticsearch';
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

describe('Elasticsearch translator: suggest body', () => {
  it('builds a match_phrase_prefix query narrowed to the completed field', () => {
    expect(buildSuggestBody({ field: 'title', prefix: 'table la', size: 5 })).toEqual({
      query: { match_phrase_prefix: { title: { query: 'table la' } } },
      size: 5,
      _source: ['title'],
    });
  });

  it('defaults size to 10 when unset', () => {
    expect(buildSuggestBody({ field: 'title', prefix: 'la' }).size).toBe(10);
  });

  it('rejects an invalid field name', () => {
    expect(() => buildSuggestBody({ field: 'title:x OR price', prefix: 'la' })).toThrow();
  });
});

describe('buildSearchBody facets', () => {
  it('compiles terms and range facets into aggs keyed by field', () => {
    const body = buildSearchBody({
      where: { type: 'match', field: 'title', value: 'lamp' },
      facets: [
        { type: 'terms', field: 'category', size: 5 },
        {
          type: 'range',
          field: 'price',
          ranges: [
            { key: 'under-50', to: 50 },
            { key: '50-150', from: 50, to: 150 },
          ],
        },
      ],
    });
    expect(body.aggs).toEqual({
      category: { terms: { field: 'category', size: 5 } },
      price: {
        range: {
          field: 'price',
          ranges: [
            { key: 'under-50', to: 50 },
            { key: '50-150', from: 50, to: 150 },
          ],
        },
      },
    });
  });

  it('defaults terms facet size to 10', () => {
    const body = buildSearchBody({
      where: { type: 'match', field: 'title', value: 'lamp' },
      facets: [{ type: 'terms', field: 'category' }],
    });
    expect(body.aggs).toEqual({ category: { terms: { field: 'category', size: 10 } } });
  });

  it('compiles postFilter to post_filter', () => {
    const body = buildSearchBody({
      where: { type: 'match', field: 'title', value: 'lamp' },
      postFilter: { type: 'term', field: 'category', value: 'lighting' },
    });
    expect(body.post_filter).toEqual({ term: { category: { value: 'lighting' } } });
  });
});

describe('parseAggregations', () => {
  it('maps aggregation buckets back to neutral facet results, preserving order', () => {
    const results = parseAggregations(
      {
        category: {
          buckets: [
            { key: 'lighting', doc_count: 4 },
            { key: 'tables', doc_count: 2 },
          ],
        },
        price: { buckets: [{ key: 'under-50', doc_count: 3 }] },
      },
      [
        { type: 'terms', field: 'category' },
        { type: 'range', field: 'price', ranges: [{ key: 'under-50', to: 50 }] },
      ],
    );
    expect(results).toEqual([
      {
        field: 'category',
        type: 'terms',
        buckets: [
          { key: 'lighting', count: 4 },
          { key: 'tables', count: 2 },
        ],
      },
      { field: 'price', type: 'range', buckets: [{ key: 'under-50', count: 3 }] },
    ]);
  });

  it('returns empty buckets when the response has no matching aggregation', () => {
    expect(parseAggregations(undefined, [{ type: 'terms', field: 'category' }])).toEqual([
      { field: 'category', type: 'terms', buckets: [] },
    ]);
  });

  it('coerces a malformed bucket without doc_count to count 0', () => {
    const results = parseAggregations({ category: { buckets: [{ key: 'lighting' }] } }, [
      { type: 'terms', field: 'category' },
    ]);
    expect(results).toEqual([
      { field: 'category', type: 'terms', buckets: [{ key: 'lighting', count: 0 }] },
    ]);
  });
});
