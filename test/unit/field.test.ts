import { describe, it, expect } from 'vitest';
import { assertValidFieldName } from '../../src/query/field';
import { translateClause } from '../../src/query/elasticsearch';
import { toSolrQuery } from '../../src/query/solr';
import { FieldValidationError } from '../../src/errors';

describe('assertValidFieldName', () => {
  it('accepts normal field names', () => {
    for (const name of ['title', 'price', '_id', 'meta.title', 'field2']) {
      expect(() => assertValidFieldName(name)).not.toThrow();
    }
  });

  it('rejects names containing query-syntax characters', () => {
    for (const name of ['title:x OR price', 'a b', 'a(b', 'a:b', 'a"b', '*', '']) {
      expect(() => assertValidFieldName(name)).toThrow(/invalid field name/);
    }
  });

  it('throws a typed FieldValidationError', () => {
    expect(() => assertValidFieldName('a:b')).toThrow(FieldValidationError);
  });
});

describe('field-name injection is blocked at the translators', () => {
  const malicious = 'title:x OR price:[* TO *]';

  it('Elasticsearch translator rejects a malicious field name', () => {
    expect(() => translateClause({ type: 'match', field: malicious, value: 'x' })).toThrow(
      /invalid field name/,
    );
  });

  it('Solr translator rejects a malicious field name (the injection vector)', () => {
    // Without validation this would inject Lucene syntax into the Solr `q`.
    expect(() => toSolrQuery({ type: 'match', field: malicious, value: 'x' })).toThrow(
      /invalid field name/,
    );
  });
});
