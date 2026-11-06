import { Card } from "@/components/ui";
import { formatCompactCurrency } from "@/lib/format";
import { COVERAGE_GOOD, COVERAGE_LOW, COVERAGE_MONTHS, FUNNEL_DAYS, coverageTone, type CoverageRow, type FunnelRow } from "@/lib/coverage-funnel";

// Dashboard card: pipeline coverage (is there enough to make the target?)
// and the lead funnel (where do leads drop out?). The team view adds a row
// per sales person.

const TONE = {
  good: { text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500", label: "Healthy" },
  low: { text: "text-amber-700", chip: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500", label: "Thin" },
  bad: { text: "text-rose-700", chip: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500", label: "At risk" },
  none: { text: "text-slate-500", chip: "bg-slate-50 text-slate-600 ring-slate-200", bar: "bg-slate-300", label: "No target set" },
} as const;
const times = (c: number | null) => (c == null ? "-" : `${c >= 10 ? Math.round(c) : c.toFixed(1)}×`);
const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const pct = (p: number | null) => (p == null ? "-" : `${p}%`);
const METER_MAX = 4;

// No coverage: either no target set, or the target is already made.
const noneLabel = (r: CoverageRow) => (r.target > 0 ? "Target met" : TONE.none.label);
function CoverageChip({ r }: { r: CoverageRow }) {
  const t = TONE[coverageTone(r.coverage)];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${t.chip}`}>
      {r.coverage == null ? noneLabel(r) : `${times(r.coverage)} · ${t.label}`}
    </span>
  );
}

const STEPS = [
  { key: "leads", label: "Leads" },
  { key: "deals", label: "Became deals" },
  { key: "quoted", label: "Quoted" },
  { key: "won", label: "Won" },
] as const;

export function CoverageFunnelCard({
  team,
  coverage,
  funnel,
  windowLabel,
}: {
  team: boolean;
  coverage: { rows: CoverageRow[]; total: CoverageRow };
  funnel: { rows: FunnelRow[]; total: FunnelRow };
  windowLabel: string;
}) {
  const c = coverage.total;
  const tone = TONE[coverageTone(c.coverage)];
  const f = funnel.total;
  const top = Math.max(1, f.leads);
  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold text-slate-900">Pipeline coverage, {windowLabel}</h2>
          <p className="mb-3 text-xs text-slate-500">
            Open deals closing by the end of {COVERAGE_MONTHS} months ÷ target still to go. About {COVERAGE_GOOD}× is healthy (roughly 1 deal in 3 is won); under {COVERAGE_LOW}× the target is at risk.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`text-3xl font-semibold tabular-nums ${tone.text}`}>{times(c.coverage)}</span>
            <span className="text-sm font-medium text-slate-700">{c.coverage == null ? noneLabel(c) : tone.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatCompactCurrency(c.pipeline)} in {c.deals} open deal{c.deals === 1 ? "" : "s"} for {formatCompactCurrency(c.toGo)} still to go
            {c.target > 0 ? ` (target ${formatCompactCurrency(c.target)}, ${formatCompactCurrency(c.achieved)} achieved this month)` : " - no targets set for these months"}
          </p>
          {c.coverage != null && (
            <div className="mt-3" role="img" aria-label={`Coverage ${times(c.coverage)}; healthy from ${COVERAGE_GOOD}×`}>
              <div className="relative h-2 rounded-full bg-slate-100">
                <div className={`absolute inset-y-0 left-0 rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, (c.coverage / METER_MAX) * 100)}%` }} />
                {[COVERAGE_LOW, COVERAGE_GOOD].map((m) => (
                  <div key={m} className="absolute -top-1 h-4 w-px bg-slate-400" style={{ left: `${(m / METER_MAX) * 100}%` }} />
                ))}
              </div>
              <div className="relative mt-1 h-4 text-[10px] text-slate-400">
                <span className="absolute left-0">0×</span>
                {[COVERAGE_LOW, COVERAGE_GOOD].map((m) => (
                  <span key={m} className="absolute -translate-x-1/2" style={{ left: `${(m / METER_MAX) * 100}%` }}>
                    {m}×
                  </span>
                ))}
                <span className="absolute right-0">{METER_MAX}×+</span>
              </div>
            </div>
          )}
          {team && coverage.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-2 font-medium">Sales person</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Still to go</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Pipeline</th>
                    <th className="py-1.5 text-right font-medium">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...coverage.rows]
                    .sort((a, b) => (a.coverage ?? Infinity) - (b.coverage ?? Infinity))
                    .map((r) => (
                      <tr key={r.userId}>
                        <td className="py-1.5 pr-2 text-slate-800">{r.name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{formatCompactCurrency(r.toGo)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{formatCompactCurrency(r.pipeline)}</td>
                        <td className="py-1.5 text-right">
                          <CoverageChip r={r} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900">Lead funnel, last {FUNNEL_DAYS} days</h2>
          <p className="mb-3 text-xs text-slate-500">The leads created in the last {FUNNEL_DAYS} days and how far they got. The % is of the step before - the smallest one is where leads are lost.</p>
          {f.leads === 0 ? (
            <p className="text-sm text-slate-500">No leads in the last {FUNNEL_DAYS} days.</p>
          ) : (
            <div className="space-y-2">
              {STEPS.map((s, i) => {
                const n = f[s.key];
                const prev = i ? f[STEPS[i - 1].key] : null;
                const step = prev == null ? null : rate(n, prev);
                return (
                  <div key={s.key} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2" title={`${s.label}: ${n}${step != null ? ` (${step}% of ${STEPS[i - 1].label.toLowerCase()})` : ""}`}>
                    <span className="text-xs text-slate-600">{s.label}</span>
                    <div className="h-6 rounded bg-slate-50">
                      {n > 0 && (
                        <div className="flex h-6 items-center rounded bg-indigo-500 px-2 text-xs font-semibold text-white" style={{ width: `${Math.max(3, (n / top) * 100)}%` }}>
                          {(n / top) * 100 >= 12 ? n : ""}
                        </div>
                      )}
                    </div>
                    <span className="text-right text-xs tabular-nums text-slate-600">
                      {n / top < 0.12 && <b className="text-slate-800">{n}</b>}
                      {n / top < 0.12 && step != null && <span className="text-slate-400"> · </span>}
                      {step != null ? `${step}%` : ""}
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-slate-500">
                {f.won} won worth {formatCompactCurrency(f.wonValue)} so far · {pct(rate(f.won, f.leads))} of leads. Recent leads may still be in progress.
              </p>
            </div>
          )}
          {team && funnel.rows.some((r) => r.leads > 0) && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-2 font-medium">Sales person</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Leads</th>
                    <th className="py-1.5 pr-2 text-right font-medium">→ Deal</th>
                    <th className="py-1.5 pr-2 text-right font-medium">→ Quote</th>
                    <th className="py-1.5 text-right font-medium">→ Won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {funnel.rows
                    .filter((r) => r.leads > 0)
                    .sort((a, b) => b.leads - a.leads)
                    .map((r) => {
                      const steps = [rate(r.deals, r.leads), rate(r.quoted, r.deals), rate(r.won, r.quoted)];
                      // The weakest step (marked) - where to coach.
                      const known = steps.filter((x): x is number => x != null);
                      const weakest = known.length > 1 ? Math.min(...known) : null;
                      return (
                        <tr key={r.userId}>
                          <td className="py-1.5 pr-2 text-slate-800">{r.name}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{r.leads}</td>
                          {steps.map((s, i) => (
                            <td key={i} className={`py-1.5 text-right tabular-nums ${i < 2 ? "pr-2" : ""} ${s != null && s === weakest ? "font-semibold text-amber-700" : "text-slate-600"}`}>
                              {pct(s)}
                              {s != null && s === weakest && <span className="sr-only"> (weakest step)</span>}
                              {s != null && s === weakest && " ▼"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-400">▼ the weakest step for each person - where coaching helps most.</p>
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}
