import { describe, it, expect } from 'vitest';
import { dedupeSuggestions } from '../../src/suggest';

describe('dedupeSuggestions', () => {
  it('keeps the first (highest-scoring) occurrence of each distinct value', () => {
    const raw = [
      { text: 'Table lamp', score: 9 },
      { text: 'Table lamp', score: 4 },
      { text: 'Desk lamp', score: 3 },
    ];
    expect(dedupeSuggestions(raw, 10)).toEqual([
      { text: 'Table lamp', score: 9 },
      { text: 'Desk lamp', score: 3 },
    ]);
  });

  it('caps the result at size, counting only distinct values', () => {
    const raw = [
      { text: 'a', score: 3 },
      { text: 'a', score: 2 },
      { text: 'b', score: 2 },
      { text: 'c', score: 1 },
    ];
    expect(dedupeSuggestions(raw, 2)).toEqual([
      { text: 'a', score: 3 },
      { text: 'b', score: 2 },
    ]);
  });

  it('skips non-string field values', () => {
    const raw = [
      { text: 42, score: 5 },
      { text: null, score: 4 },
      { text: 'Real', score: 3 },
    ];
    expect(dedupeSuggestions(raw, 10)).toEqual([{ text: 'Real', score: 3 }]);
  });

  it('returns an empty array for no input', () => {
    expect(dedupeSuggestions([], 10)).toEqual([]);
  });
});
