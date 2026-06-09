import { NextResponse } from 'next/server';
import { compare, type Query } from 'polysearch';
import { errorMessage, namedEngines } from '@/lib/engines';
import { INDEX } from '@/lib/sampleData';

interface CompareBody {
  engines?: string[];
  q?: string;
  field?: string;
  size?: number;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CompareBody;
  const field = body.field ?? 'title';
  const size = body.size ?? 10;
  const query: Query = { where: { type: 'match', field, value: body.q ?? '' }, size };

  try {
    const engines = namedEngines(body.engines ?? ['es', 'os', 'solr']);
    const comparison = await compare(engines, INDEX, query, size);

    // Enrich with document sources (titles etc.) from the first engine that
    // responded, so the UI can show titles next to the ids.
    const sources: Record<string, Record<string, unknown>> = {};
    const responder = engines.find((e) => comparison.engines.includes(e.name));
    if (responder) {
      const result = await responder.engine.search(INDEX, query);
      for (const hit of result.hits) sources[hit.id] = hit.source;
    }

    return NextResponse.json({ comparison, sources });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
