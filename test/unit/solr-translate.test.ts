import { describe, it, expect } from 'vitest';
import { toSolrQuery } from '../../src/query/solr';

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
