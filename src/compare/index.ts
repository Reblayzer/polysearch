/**
 * Compare mode: run one query across several engines and surface how their
 * rankings differ. This is the project's headline feature.
 *
 * It deliberately does NOT compare raw scores across engines (BM25 scores are
 * not comparable between engines). Instead it reports what IS meaningful:
 *   - which documents every engine returned in its top-K (set overlap), and a
 *     pairwise Jaccard similarity of the top-K sets;
 *   - each document's rank and score per engine, side by side.
 *
 * The maths (`buildComparison`) is a pure function, unit-tested without engines;
 * `compare` is the thin async wrapper that fans out the searches.
 */
import type { SearchEngine } from '../engine';
import type { Query } from '../query/types';

/** An engine to include in a comparison, paired with a display name. */
export interface NamedEngine {
  name: string;
  engine: SearchEngine;
}

/** One engine's top-K result for the compared query. */
export interface EngineResult {
  engine: string;
  total: number;
  hits: { id: string; score: number; rank: number }[];
}

/** A document's placement across engines (null where an engine did not return it). */
export interface DocumentComparison {
  id: string;
  perEngine: Record<string, { rank: number; score: number } | null>;
  presentInAll: boolean;
}

/** An engine that failed to respond during a comparison. */
export interface EngineFailure {
  engine: string;
  error: string;
}

export interface ComparisonResult {
  engines: string[];
  topK: number;
  perEngine: EngineResult[];
  documents: DocumentComparison[];
  overlap: {
    /** Document ids present in every engine's top-K. */
    sharedByAll: string[];
    /** Jaccard similarity of top-K sets, keyed "engineA|engineB". */
    pairwiseJaccard: Record<string, number>;
  };
  /** Engines that did not respond. The comparison proceeds with the rest. */
  failures: EngineFailure[];
}

/** Jaccard similarity of two sets: |A ∩ B| / |A ∪ B| (1 when both are empty). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Pure core: turn per-engine top-K results into a structured comparison. */
export function buildComparison(
  perEngine: EngineResult[],
  topK: number,
  failures: EngineFailure[] = [],
): ComparisonResult {
  const engineNames = perEngine.map((e) => e.engine);

  const placement = new Map<string, Map<string, { rank: number; score: number }>>();
  for (const result of perEngine) {
    const byId = new Map<string, { rank: number; score: number }>();
    for (const hit of result.hits) byId.set(hit.id, { rank: hit.rank, score: hit.score });
    placement.set(result.engine, byId);
  }

  const allIds = new Set<string>();
  for (const result of perEngine) for (const hit of result.hits) allIds.add(hit.id);

  const documents: DocumentComparison[] = [...allIds].map((id) => {
    const perEngineDoc: Record<string, { rank: number; score: number } | null> = {};
    let presentInAll = true;
    for (const name of engineNames) {
      const entry = placement.get(name)?.get(id) ?? null;
      perEngineDoc[name] = entry;
      if (entry === null) presentInAll = false;
    }
    return { id, perEngine: perEngineDoc, presentInAll };
  });

  documents.sort((a, b) => bestRank(a) - bestRank(b) || a.id.localeCompare(b.id));

  const sharedByAll = documents.filter((d) => d.presentInAll).map((d) => d.id);

  const pairwiseJaccard: Record<string, number> = {};
  for (let i = 0; i < perEngine.length; i++) {
    for (let j = i + 1; j < perEngine.length; j++) {
      const a = perEngine[i];
      const b = perEngine[j];
      if (!a || !b) continue;
      const setA = new Set(a.hits.map((h) => h.id));
      const setB = new Set(b.hits.map((h) => h.id));
      pairwiseJaccard[`${a.engine}|${b.engine}`] = jaccard(setA, setB);
    }
  }

  return {
    engines: engineNames,
    topK,
    perEngine,
    documents,
    overlap: { sharedByAll, pairwiseJaccard },
    failures,
  };
}

/** The best (lowest) rank a document achieved on any engine, or Infinity. */
function bestRank(doc: DocumentComparison): number {
  let best = Infinity;
  for (const entry of Object.values(doc.perEngine)) {
    if (entry && entry.rank < best) best = entry.rank;
  }
  return best;
}

/**
 * Run one query across several engines and build the comparison. Uses
 * allSettled so a single unreachable engine does not fail the whole run: the
 * comparison proceeds with the engines that responded, and the rest are reported
 * in `failures`.
 */
export async function compare(
  engines: NamedEngine[],
  index: string,
  query: Query,
  topK = 10,
): Promise<ComparisonResult> {
  const settled = await Promise.allSettled(
    engines.map(async ({ name, engine }): Promise<EngineResult> => {
      const result = await engine.search(index, { ...query, size: topK });
      return {
        engine: name,
        total: result.total,
        hits: result.hits.slice(0, topK).map((h, i) => ({ id: h.id, score: h.score, rank: i + 1 })),
      };
    }),
  );

  const perEngine: EngineResult[] = [];
  const failures: EngineFailure[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      perEngine.push(outcome.value);
    } else {
      const name = engines[i]?.name ?? `engine-${i}`;
      const reason: unknown = outcome.reason;
      failures.push({
        engine: name,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });

  return buildComparison(perEngine, topK, failures);
}

/** Render a comparison as a human-readable table, suitable for pasting into a review. */
export function formatComparison(result: ComparisonResult): string {
  const lines: string[] = [];
  lines.push(`Comparison across ${result.engines.join(', ')} (top ${result.topK})`);
  lines.push('');

  if (result.failures.length > 0) {
    lines.push('Engines that did not respond:');
    for (const failure of result.failures) {
      lines.push(`  ${failure.engine}: ${failure.error}`);
    }
    lines.push('');
  }

  lines.push('Top-K overlap (Jaccard):');
  const pairs = Object.entries(result.overlap.pairwiseJaccard);
  if (pairs.length === 0) {
    lines.push('  (need at least two engines)');
  } else {
    for (const [pair, value] of pairs) {
      lines.push(`  ${pair.replace('|', ' vs ')}: ${value.toFixed(2)}`);
    }
  }
  lines.push(
    `  shared by all: ${
      result.overlap.sharedByAll.length > 0 ? result.overlap.sharedByAll.join(', ') : '(none)'
    }`,
  );
  lines.push('');

  // Per-document table: id, then "rank (score)" per engine.
  const header = ['doc', ...result.engines];
  const rows = result.documents.map((doc) => {
    const cells = result.engines.map((name) => {
      const entry = doc.perEngine[name];
      return entry ? `#${entry.rank} (${entry.score.toFixed(2)})` : '-';
    });
    return [doc.id, ...cells];
  });

  const widths = header.map((h, col) =>
    Math.max(h.length, ...rows.map((r) => (r[col] ?? '').length)),
  );
  const renderRow = (cells: string[]): string =>
    cells.map((c, col) => c.padEnd(widths[col] ?? 0)).join('  ');

  lines.push(renderRow(header));
  lines.push(renderRow(widths.map((w) => '-'.repeat(w))));
  for (const row of rows) lines.push(renderRow(row));

  return lines.join('\n');
}
