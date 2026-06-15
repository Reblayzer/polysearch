'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComparisonResult, ExplainResult, FacetResult, Hit, SearchResult, Suggestion } from 'polysearch';

type EngineKey = 'es' | 'os' | 'solr';

const ENGINE_META: Record<EngineKey, { label: string; dot: string; text: string }> = {
  es: { label: 'Elasticsearch', dot: 'bg-amber-400', text: 'text-amber-300' },
  os: { label: 'OpenSearch', dot: 'bg-sky-400', text: 'text-sky-300' },
  solr: { label: 'Solr', dot: 'bg-rose-400', text: 'text-rose-300' },
};
const ALL_ENGINES: EngineKey[] = ['es', 'os', 'solr'];
const FIELDS = ['title', 'description', 'category'];

interface CompareResponse {
  comparison: ComparisonResult;
  sources: Record<string, Record<string, unknown>>;
}

function titleOf(source: Record<string, unknown> | undefined): string {
  return typeof source?.title === 'string' ? source.title : '';
}

export default function Home() {
  const [q, setQ] = useState('table lamp');
  const [field, setField] = useState('title');
  const [size, setSize] = useState(10);
  const [mode, setMode] = useState<'compare' | 'search'>('compare');
  const [engines, setEngines] = useState<EngineKey[]>(['es', 'os', 'solr']);
  const [searchEngine, setSearchEngine] = useState<EngineKey>('es');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [searchData, setSearchData] = useState<SearchResult | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  // Facet sidebar selections: bucket keys per facet field (search mode only).
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  // As-you-type autocomplete. Compare mode has several engines selected, so the
  // dropdown completes against the first of them; search mode uses its engine.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestEngine = mode === 'search' ? searchEngine : (engines[0] ?? 'es');

  useEffect(() => {
    const prefix = q.trim();
    // Debounce: wait for a pause in typing before asking the engine. All state
    // updates happen inside this callback (never synchronously in the effect
    // body) so a keystroke does not trigger a cascading render.
    const timer = setTimeout(() => {
      if (!showSuggest || prefix === '') {
        setSuggestions([]);
        return;
      }
      void (async () => {
        try {
          const res = await fetch('/api/suggest', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ engine: suggestEngine, prefix: q, field }),
          });
          if (!res.ok) {
            setSuggestions([]);
            return;
          }
          const data = (await res.json()) as { suggestions?: Suggestion[] };
          setSuggestions(data.suggestions ?? []);
        } catch {
          setSuggestions([]);
        }
      })();
    }, 200);
    return () => clearTimeout(timer);
  }, [q, field, suggestEngine, showSuggest]);

  const pickSuggestion = (text: string) => {
    setQ(text);
    setShowSuggest(false);
    setSuggestions([]);
  };

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'compare') {
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ engines, q, field, size }),
        });
        const data: unknown = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'compare failed');
        setCompareData(data as CompareResponse);
      } else {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ engine: searchEngine, q, field, size, selections }),
        });
        const data: unknown = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'search failed');
        setSearchData(data as SearchResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mode, engines, searchEngine, q, field, size, selections]);

  const seed = useCallback(async () => {
    setSeedMsg('Seeding…');
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = (await res.json()) as {
        count: number;
        results: Record<string, { indexed?: number; error?: string }>;
      };
      const parts = Object.entries(data.results).map(([k, v]) =>
        v.error ? `${k}: failed` : `${k}: ${v.indexed ?? 0}`,
      );
      setSeedMsg(`Indexed ${data.count} docs — ${parts.join(', ')}`);
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const toggleEngine = (key: EngineKey) =>
    setEngines((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));

  const toggleSelection = (facetField: string, key: string) =>
    setSelections((prev) => {
      const current = prev[facetField] ?? [];
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      return { ...prev, [facetField]: next };
    });

  // Re-run the search when filters change, but only once results are on screen
  // (searchData set). Deps are deliberately ONLY [selections]: run/mode/searchData
  // would re-fire this on every search result, looping. The suppressed rule can't
  // see that run() is an async kick-off, not a synchronous setState.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === 'search' && searchData) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Poly<span className="text-sky-400">Search</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Run one query across Elasticsearch, OpenSearch and Solr, and see how they differ.
          </p>
        </div>
        <button
          onClick={() => void seed()}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          Seed example data
        </button>
      </header>

      {seedMsg && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60">
          {seedMsg}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setShowSuggest(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowSuggest(false);
                  void run();
                } else if (e.key === 'Escape') {
                  setShowSuggest(false);
                }
              }}
              placeholder="Search query…"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/50"
            />
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl shadow-black/40">
                <ul>
                  {suggestions.map((s) => (
                    <li key={s.text}>
                      <button
                        type="button"
                        // onMouseDown fires before the input's onBlur, so the
                        // pick lands before the dropdown is told to close.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSuggestion(s.text);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-white/80 transition hover:bg-white/10"
                      >
                        <span className="truncate">{s.text}</span>
                        <span className="shrink-0 text-xs tabular-nums text-white/30">
                          {s.score.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/5 px-4 py-1.5 text-[11px] text-white/30">
                  autocomplete via {ENGINE_META[suggestEngine].label} · {field}
                </div>
              </div>
            )}
          </div>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-400/50"
          >
            {FIELDS.map((f) => (
              <option key={f} value={f} className="bg-slate-900">
                {f}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={50}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-20 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-400/50"
          />
          <button
            onClick={() => void run()}
            disabled={loading}
            className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Run'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-white/10 p-0.5 text-sm">
            {(['compare', 'search'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  if (m !== 'search') setSelections({});
                  setMode(m);
                }}
                className={`rounded-md px-3 py-1 capitalize transition ${
                  mode === m ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'compare' ? (
            <div className="flex flex-wrap items-center gap-2">
              {ALL_ENGINES.map((key) => (
                <button
                  key={key}
                  onClick={() => toggleEngine(key)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition ${
                    engines.includes(key)
                      ? 'border-white/20 bg-white/10 text-white'
                      : 'border-white/10 text-white/40'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${ENGINE_META[key].dot}`} />
                  {ENGINE_META[key].label}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={searchEngine}
              onChange={(e) => setSearchEngine(e.target.value as EngineKey)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none"
            >
              {ALL_ENGINES.map((key) => (
                <option key={key} value={key} className="bg-slate-900">
                  {ENGINE_META[key].label}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-6">
        {mode === 'compare' && compareData && <CompareView data={compareData} />}
        {mode === 'search' && searchData && (
          <div className="grid gap-4 md:grid-cols-[230px_1fr]">
            <FacetSidebar
              facets={searchData.facets ?? []}
              selections={selections}
              onToggle={toggleSelection}
            />
            <SearchView data={searchData} engine={searchEngine} q={q} field={field} />
          </div>
        )}
      </div>
    </main>
  );
}

function CompareView({ data }: { data: CompareResponse }) {
  const { comparison, sources } = data;
  const engines = comparison.engines as EngineKey[];

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="Top-K overlap (Jaccard)">
          {Object.keys(comparison.overlap.pairwiseJaccard).length === 0 ? (
            <p className="text-sm text-white/40">Need at least two engines.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {Object.entries(comparison.overlap.pairwiseJaccard).map(([pair, value]) => (
                <li key={pair} className="flex items-center justify-between gap-3">
                  <span className="text-white/60">{pair.replace('|', ' vs ')}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full bg-sky-400"
                        style={{ width: `${Math.round(value * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right tabular-nums text-white/80">
                      {value.toFixed(2)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Agreement">
          <p className="text-sm text-white/60">
            Shared by all:{' '}
            <span className="text-white/90">{comparison.overlap.sharedByAll.length || 'none'}</span>{' '}
            {comparison.overlap.sharedByAll.length > 0 && (
              <span className="text-white/40">({comparison.overlap.sharedByAll.join(', ')})</span>
            )}
          </p>
          {comparison.failures.length > 0 && (
            <p className="mt-2 text-sm text-rose-300">
              Did not respond: {comparison.failures.map((f) => f.engine).join(', ')}
            </p>
          )}
          <p className="mt-2 text-xs text-white/40">
            Scores are per engine and not comparable across engines; the ranking is what matters.
          </p>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">Document</th>
              {engines.map((e) => (
                <th key={e} className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${ENGINE_META[e]?.dot}`} />
                    {ENGINE_META[e]?.label ?? e}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.documents.map((doc) => (
              <tr key={doc.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">
                  <span className="text-white/90">{titleOf(sources[doc.id]) || `#${doc.id}`}</span>
                  <span className="ml-2 text-xs text-white/30">id {doc.id}</span>
                </td>
                {engines.map((e) => {
                  const cell = doc.perEngine[e];
                  return (
                    <td key={e} className="px-4 py-3 tabular-nums">
                      {cell ? (
                        <span>
                          <span className={ENGINE_META[e]?.text}>#{cell.rank}</span>{' '}
                          <span className="text-white/40">{cell.score.toFixed(2)}</span>
                        </span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SearchView({
  data,
  engine,
  q,
  field,
}: {
  data: SearchResult;
  engine: EngineKey;
  q: string;
  field: string;
}) {
  return (
    <section>
      <p className="mb-3 text-sm text-white/50">
        {data.total} hit{data.total === 1 ? '' : 's'} on {ENGINE_META[engine].label} in {data.tookMs}
        ms
      </p>
      <ul className="space-y-2">
        {data.hits.map((hit, i) => (
          <HitRow key={hit.id} hit={hit} rank={i + 1} engine={engine} q={q} field={field} />
        ))}
      </ul>
    </section>
  );
}

function FacetSidebar({
  facets,
  selections,
  onToggle,
}: {
  facets: FacetResult[];
  selections: Record<string, string[]>;
  onToggle: (field: string, key: string) => void;
}) {
  if (facets.length === 0) return null;
  return (
    <aside className="space-y-4 self-start">
      {facets.map((facet) => (
        <div key={facet.field} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-white/40 uppercase">
            {facet.field}
          </h2>
          <ul className="space-y-1.5">
            {facet.buckets.map((bucket) => {
              const checked = (selections[facet.field] ?? []).includes(bucket.key);
              return (
                <li key={bucket.key}>
                  <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-white/70 hover:text-white">
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(facet.field, bucket.key)}
                        className="accent-sky-500"
                      />
                      <span className="truncate">{bucket.key}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-white/30">
                      {bucket.count}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function HitRow({
  hit,
  rank,
  engine,
  q,
  field,
}: {
  hit: Hit;
  rank: number;
  engine: EngineKey;
  q: string;
  field: string;
}) {
  const [explain, setExplain] = useState<ExplainResult | null>(null);
  const [open, setOpen] = useState(false);

  const source = hit.source as { title?: string; category?: string; price?: number };
  const snippet = hit.highlights?.[field]?.[0];

  const runExplain = async () => {
    setOpen(true);
    if (explain) return;
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engine, q, field, doc: hit.id }),
    });
    setExplain((await res.json()) as ExplainResult);
  };

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30">#{rank}</span>
            <h3 className="font-medium text-white/90">{source.title ?? `id ${hit.id}`}</h3>
          </div>
          {snippet ? (
            <p className="mt-1 text-sm text-white/50" dangerouslySetInnerHTML={{ __html: snippet }} />
          ) : (
            source.category && <p className="mt-1 text-sm text-white/40">{source.category}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
            {source.category && <span>{source.category}</span>}
            {typeof source.price === 'number' && <span>{source.price} kr</span>}
            <button onClick={() => void runExplain()} className="text-sky-400 hover:underline">
              {open ? 'explanation ↓' : 'explain'}
            </button>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-white/30">score</div>
          <div className="tabular-nums text-white/80">{hit.score.toFixed(2)}</div>
        </div>
      </div>
      {open && (
        <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-black/40 p-3 text-xs whitespace-pre-wrap text-white/60">
          {explain ? explain.detail || '(no explanation)' : 'loading…'}
        </pre>
      )}
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-white/40 uppercase">{title}</h2>
      {children}
    </div>
  );
}
