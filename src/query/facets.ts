/**
 * Shared facet-request validation, used by both translators so a malformed
 * request fails identically (and before any network call) on every engine.
 */
import type { FacetRequest } from './types';
import { assertValidFieldName } from './field';
import { PolySearchError } from '../errors';

/** The default number of terms buckets when a request omits `size`. */
export const DEFAULT_TERMS_SIZE = 10;

export function assertValidFacets(facets: FacetRequest[]): void {
  const seen = new Set<string>();
  for (const facet of facets) {
    assertValidFieldName(facet.field);
    if (seen.has(facet.field)) {
      throw new PolySearchError(`duplicate facet on field "${facet.field}"`);
    }
    seen.add(facet.field);
    if (facet.type === 'terms') {
      if (facet.size !== undefined && facet.size <= 0) {
        throw new PolySearchError(`terms facet on "${facet.field}": size must be positive`);
      }
    } else {
      if (facet.ranges.length === 0) {
        throw new PolySearchError(`range facet on "${facet.field}" needs at least one range`);
      }
      for (const range of facet.ranges) {
        if (range.from === undefined && range.to === undefined) {
          throw new PolySearchError(
            `range facet on "${facet.field}": range "${range.key}" has neither from nor to`,
          );
        }
      }
    }
  }
}
