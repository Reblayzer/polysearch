import { describe, it, expect } from 'vitest';
import {
  toSolrQuery,
  toSolrSuggest,
  toSolrFacetParams,
  toSolrPostFilter,
  parseSolrFacets,
} from '../../src/query/solr';

describe('Solr translator: single clauses', () => {
  it('translates a match clause into a field query', () => {
    expect(toSolrQuery({ type: 'match', field: 'title', value: 'table lamp' })).toEqual({
      q: 'title:(table lamp)',
      fq: [],
    });
  });

  it('quotes string terms and leaves numbers/booleans bare', () => {
    expect(toSolrQuery({ type: 'term', field: 'category', value: 'lighting' })).toEqual({
      q: 'category:"lighting"',
      fq: [],
    });
    expect(toSolrQuery({ type: 'term', field: 'price', value: 39 })).toEqual({
      q: 'price:39',
      fq: [],
    });
    expect(toSolrQuery({ type: 'term', field: 'discontinued', value: true })).toEqual({
      q: 'discontinued:true',
      fq: [],
    });
  });

  it('renders ranges with inclusive/exclusive brackets', () => {
    expect(toSolrQuery({ type: 'range', field: 'price', lte: 50 }).q).toBe('price:[* TO 50]');
    expect(toSolrQuery({ type: 'range', field: 'price', gte: 10, lt: 100 }).q).toBe(
      'price:[10 TO 100}',
    );
    expect(toSolrQuery({ type: 'range', field: 'price', gt: 10 }).q).toBe('price:{10 TO *]');
  });

  it('escapes Lucene special characters in match values', () => {
    expect(toSolrQuery({ type: 'match', field: 'title', value: 'a+b:c' }).q).toBe(
      'title:(a\\+b\\:c)',
    );
  });
});

describe('Solr translator: bool clauses', () => {
  it('maps must/should/mustNot to +/unprefixed/- and filter to fq', () => {
    const result = toSolrQuery({
      type: 'bool',
      must: [{ type: 'match', field: 'title', value: 'lamp' }],
      should: [{ type: 'match', field: 'description', value: 'oak' }],
      mustNot: [{ type: 'term', field: 'discontinued', value: true }],
      filter: [{ type: 'range', field: 'price', lte: 40 }],
    });

    expect(result).toEqual({
      q: '+(title:(lamp)) (description:(oak)) -(discontinued:true)',
      fq: ['price:[* TO 40]'],
    });
  });

  it('uses match-all when a top-level bool has only filters', () => {
    const result = toSolrQuery({
      type: 'bool',
      filter: [{ type: 'term', field: 'category', value: 'lighting' }],
    });

    expect(result).toEqual({ q: '*:*', fq: ['category:"lighting"'] });
  });
});

describe('Solr translator: suggest', () => {
  it('requires every token and wildcards only the last', () => {
    expect(toSolrSuggest({ field: 'title', prefix: 'table la' })).toBe('title:(+table +la*)');
  });

  it('handles a single-token prefix', () => {
    expect(toSolrSuggest({ field: 'title', prefix: 'lamp' })).toBe('title:(+lamp*)');
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(toSolrSuggest({ field: 'title', prefix: '  table   la ' })).toBe('title:(+table +la*)');
  });

  it('escapes Lucene specials in tokens but keeps the trailing wildcard live', () => {
    // The ':' in the user input is escaped; the appended '*' is real syntax.
    expect(toSolrSuggest({ field: 'title', prefix: 'a:b' })).toBe('title:(+a\\:b*)');
  });

  it('returns an empty q for an empty or whitespace-only prefix', () => {
    expect(toSolrSuggest({ field: 'title', prefix: '' })).toBe('');
    expect(toSolrSuggest({ field: 'title', prefix: '   ' })).toBe('');
  });

  it('rejects an invalid field name', () => {
    expect(() => toSolrSuggest({ field: 'title:x OR price', prefix: 'la' })).toThrow();
  });
});

describe('toSolrFacetParams', () => {
  it('builds tagged facet.field params for terms facets', () => {
    expect(toSolrFacetParams([{ type: 'terms', field: 'category', size: 5 }])).toEqual([
      ['facet', 'true'],
      ['facet.field', '{!ex=pf}category'],
      ['f.category.facet.limit', '5'],
      ['f.category.facet.mincount', '1'],
    ]);
  });

  it('builds one tagged facet.query per range bucket', () => {
    expect(
      toSolrFacetParams([
        {
          type: 'range',
          field: 'price',
          ranges: [
            { key: 'under-50', to: 50 },
            { key: '150-up', from: 150 },
          ],
        },
      ]),
    ).toEqual([
      ['facet', 'true'],
      ['facet.query', '{!ex=pf}price:[* TO 50}'],
      ['facet.query', '{!ex=pf}price:[150 TO *]'],
    ]);
  });
});

describe('toSolrPostFilter', () => {
  it('renders a bool of shoulds as a single OR string', () => {
    expect(
      toSolrPostFilter({
        type: 'bool',
        should: [
          { type: 'term', field: 'category', value: 'lighting' },
          { type: 'term', field: 'category', value: 'tables' },
        ],
        minimumShouldMatch: 1,
      }),
    ).toBe('(category:"lighting") (category:"tables")');
  });

  it('keeps nested filter clauses inline instead of spilling them to fq', () => {
    expect(
      toSolrPostFilter({
        type: 'bool',
        filter: [
          { type: 'term', field: 'category', value: 'lighting' },
          { type: 'range', field: 'price', gte: 50, lt: 150 },
        ],
      }),
    ).toBe('+(category:"lighting") +(price:[50 TO 150})');
  });
});

describe('parseSolrFacets', () => {
  it('parses facet_fields flat arrays and maps facet_queries back to range keys', () => {
    const results = parseSolrFacets(
      {
        facet_fields: { category: ['lighting', 4, 'tables', 2] },
        facet_queries: { '{!ex=pf}price:[* TO 50}': 3, '{!ex=pf}price:[150 TO *]': 1 },
      },
      [
        { type: 'terms', field: 'category' },
        {
          type: 'range',
          field: 'price',
          ranges: [
            { key: 'under-50', to: 50 },
            { key: '150-up', from: 150 },
          ],
        },
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
      {
        field: 'price',
        type: 'range',
        buckets: [
          { key: 'under-50', count: 3 },
          { key: '150-up', count: 1 },
        ],
      },
    ]);
  });

  it('returns zero counts when facet_counts is missing', () => {
    expect(
      parseSolrFacets(undefined, [
        { type: 'range', field: 'price', ranges: [{ key: 'under-50', to: 50 }] },
      ]),
    ).toEqual([{ field: 'price', type: 'range', buckets: [{ key: 'under-50', count: 0 }] }]);
  });
});
