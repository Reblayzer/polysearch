import type { FacetRequest, QueryClause, RangeQuery } from 'polysearch';

/** The demo facet set for the sample furniture corpus. */
export const FACETS: FacetRequest[] = [
  { type: 'terms', field: 'category' },
  {
    type: 'range',
    field: 'price',
    ranges: [
      { key: 'Under 50', to: 50 },
      { key: '50 – 150', from: 50, to: 150 },
      { key: '150 +', from: 150 },
    ],
  },
];

/**
 * Turn the sidebar's selections (bucket keys per facet field) into a
 * postFilter clause: OR within a facet, AND across facets. Returns undefined
 * when nothing is selected.
 */
export function buildPostFilter(
  selections: Record<string, string[]>,
): QueryClause | undefined {
  const groups: QueryClause[] = [];
  for (const facet of FACETS) {
    const selected = selections[facet.field] ?? [];
    if (selected.length === 0) continue;
    const options: QueryClause[] =
      facet.type === 'terms'
        ? selected.map((value) => ({ type: 'term' as const, field: facet.field, value }))
        : facet.ranges
            .filter((range) => selected.includes(range.key))
            .map(
              (range): RangeQuery => ({
                type: 'range',
                field: facet.field,
                ...(range.from !== undefined ? { gte: range.from } : {}),
                ...(range.to !== undefined ? { lt: range.to } : {}),
              }),
            );
    if (options.length === 0) continue;
    groups.push({ type: 'bool', should: options, minimumShouldMatch: 1 });
  }
  if (groups.length === 0) return undefined;
  return { type: 'bool', filter: groups };
}
