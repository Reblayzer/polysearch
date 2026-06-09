import { NextResponse } from 'next/server';
import type { Query } from 'polysearch';
import { engineFor, errorMessage } from '@/lib/engines';
import { INDEX } from '@/lib/sampleData';

interface ExplainBody {
  engine?: string;
  q?: string;
  field?: string;
  doc?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ExplainBody;
  const field = body.field ?? 'title';
  const query: Query = { where: { type: 'match', field, value: body.q ?? '' } };
  try {
    const result = await engineFor(body.engine ?? 'es').explain(INDEX, query, body.doc ?? '');
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
