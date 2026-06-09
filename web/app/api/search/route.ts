import { NextResponse } from 'next/server';
import type { Query } from 'polysearch';
import { engineFor, errorMessage } from '@/lib/engines';
import { INDEX } from '@/lib/sampleData';

interface SearchBody {
  engine?: string;
  q?: string;
  field?: string;
  size?: number;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SearchBody;
  const field = body.field ?? 'title';
  const query: Query = {
    where: { type: 'match', field, value: body.q ?? '' },
    size: body.size ?? 10,
    highlight: { fields: [field] },
  };
  try {
    const result = await engineFor(body.engine ?? 'es').search(INDEX, query);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
