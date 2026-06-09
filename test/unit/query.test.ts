import { describe, it, expect } from 'vitest';
import type { Query } from '../../src/query/types';

/**
 * Day 1 smoke test. There is no translator logic yet (that arrives with the
 * adapters), so for now we just prove the unified Query DSL is expressive enough
 * to build a realistic retail-style query and that the types line up. Real
 * per-engine translator tests replace/extend this from day 2 onward.
 */
describe('unified Query DSL', () => {
  it('expresses a bool query with full-text match plus a price filter', () => {
    const query: Query = {
      where: {
        type: 'bool',
        must: [{ type: 'match', field: 'title', value: 'table lamp' }],
        should: [{ type: 'match', field: 'description', value: 'oak' }],
        filter: [
          { type: 'term', field: 'category', value: 'lighting' },
          { type: 'range', field: 'price', lte: 50 },
        ],
        mustNot: [{ type: 'term', field: 'discontinued', value: true }],
      },
      sort: [{ field: 'price', order: 'asc' }],
      from: 0,
      size: 10,
      highlight: { fields: ['title', 'description'] },
    };

    expect(query.where.type).toBe('bool');
    expect(query.size).toBe(10);
    // Narrow the union to read into the bool clause.
    if (query.where.type === 'bool') {
      expect(query.where.must).toHaveLength(1);
      expect(query.where.filter).toHaveLength(2);
    }
  });
});
