import { NextResponse } from 'next/server';
import { engineFor, errorMessage } from '@/lib/engines';
import { INDEX } from '@/lib/sampleData';

interface SuggestBody {
  engine?: string;
  prefix?: string;
  field?: string;
  size?: number;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SuggestBody;
  try {
    const result = await engineFor(body.engine ?? 'es').suggest(INDEX, {
      field: body.field ?? 'title',
      prefix: body.prefix ?? '',
      size: body.size ?? 8,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
