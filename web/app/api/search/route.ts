import { NextResponse } from 'next/server';
import type { Query } from 'polysearch';
import { engineFor, errorMessage } from '@/lib/engines';
import { INDEX } from '@/lib/sampleData';
import { FACETS, buildPostFilter } from '@/lib/facetConfig';

interface SearchBody {
  engine?: string;
  q?: string;
  field?: string;
  size?: number;
  /** Selected facet bucket keys per field, from the sidebar. */
  selections?: Record<string, string[]>;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SearchBody;
  const field = body.field ?? 'title';
  const query: Query = {
    where: { type: 'match', field, value: body.q ?? '' },
    size: body.size ?? 10,
    highlight: { fields: [field] },
    facets: FACETS,
  };
  const postFilter = buildPostFilter(body.selections ?? {});
  if (postFilter) query.postFilter = postFilter;
  try {
    const result = await engineFor(body.engine ?? 'es').search(INDEX, query);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
