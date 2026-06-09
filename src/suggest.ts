/**
 * Shared post-processing for prefix-based autocomplete.
 *
 * The engines answer a suggest request by running a prefix search and returning
 * whole documents, so the adapter is left with a list of (field value, score)
 * pairs that can contain duplicates: several products may share the same title,
 * for instance. This turns that raw list into the suggestions a UI wants, the
 * same way for every engine, which is why it lives here rather than in each
 * adapter.
 */
import type { Suggestion } from './types';

/**
 * De-duplicate raw (text, score) pairs into ranked suggestions.
 *
 * Input is assumed already ordered by relevance (the engine returns hits best
 * first), so the first occurrence of each distinct string wins and later
 * duplicates are dropped. Non-string values are skipped: autocomplete completes
 * text fields, and a numeric or array field value is not a sensible suggestion.
 */
export function dedupeSuggestions(
  raw: { text: unknown; score: number }[],
  size: number,
): Suggestion[] {
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const { text, score } of raw) {
    if (typeof text !== 'string' || seen.has(text)) continue;
    seen.add(text);
    suggestions.push({ text, score });
    if (suggestions.length >= size) break;
  }
  return suggestions;
}
