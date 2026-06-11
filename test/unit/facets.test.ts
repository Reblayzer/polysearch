import { describe, expect, it } from 'vitest';
import { assertValidFacets } from '../../src/query/facets';
import { FieldValidationError, PolysearchError } from '../../src/errors';

describe('assertValidFacets', () => {
  it('accepts a valid terms + range facet list', () => {
    expect(() =>
      assertValidFacets([
        { type: 'terms', field: 'category' },
        { type: 'range', field: 'price', ranges: [{ key: 'under-50', to: 50 }] },
      ]),
    ).not.toThrow();
  });

  it('rejects an invalid field name', () => {
    expect(() => assertValidFacets([{ type: 'terms', field: 'cat egory' }])).toThrow(
      FieldValidationError,
    );
  });

  it('rejects duplicate facet fields', () => {
    expect(() =>
      assertValidFacets([
        { type: 'terms', field: 'category' },
        { type: 'terms', field: 'category' },
      ]),
    ).toThrow(PolysearchError);
  });

  it('rejects a range facet with no ranges', () => {
    expect(() => assertValidFacets([{ type: 'range', field: 'price', ranges: [] }])).toThrow(
      PolysearchError,
    );
  });

  it('accepts an empty facet list', () => {
    expect(() => assertValidFacets([])).not.toThrow();
  });

  it('rejects a non-positive terms size', () => {
    expect(() => assertValidFacets([{ type: 'terms', field: 'category', size: 0 }])).toThrow(
      PolysearchError,
    );
  });

  it('rejects a range with neither from nor to', () => {
    expect(() =>
      assertValidFacets([{ type: 'range', field: 'price', ranges: [{ key: 'all' }] }]),
    ).toThrow(PolysearchError);
  });
});
