import { NextResponse } from 'next/server';
import { ENGINE_KEYS, engineFor, errorMessage } from '@/lib/engines';
import { INDEX, products, schema } from '@/lib/sampleData';

/** Index the sample corpus into every engine. Each engine is independent, so
 * one being down doesn't stop the others. */
export async function POST() {
  const results: Record<string, { indexed: number; errors: number } | { error: string }> = {};

  for (const key of ENGINE_KEYS) {
    try {
      const engine = engineFor(key);
      await engine.createIndex(INDEX, schema);
      const result = await engine.bulkIndex(INDEX, products);
      results[key] = { indexed: result.indexed, errors: result.errors.length };
    } catch (err) {
      results[key] = { error: errorMessage(err) };
    }
  }

  return NextResponse.json({ index: INDEX, count: products.length, results });
}
