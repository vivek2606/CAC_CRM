import Link from "next/link";
import { STANDARD_KEYS, STANDARD_LABEL, type Standards } from "@/lib/activity-standards-constants";

// This week against the minimums: one bar per measure.
export function Scorecard({ counts, standards, compact = false }: { counts: Standards; standards: Standards; compact?: boolean }) {
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
      {STANDARD_KEYS.map((k) => {
        const min = standards[k];
        const done = counts[k];
        const pct = min > 0 ? Math.min(100, Math.round((done / min) * 100)) : 100;
        const met = done >= min;
        return (
          <div key={k} className="rounded-lg border border-slate-200 px-3 py-2.5">
            <p className="text-xs text-slate-500">{STANDARD_LABEL[k]}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
              {done}
              <span className="text-sm font-normal text-slate-400"> / {min}</span>
            </p>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
              <div className={`h-1.5 rounded-full ${met ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ScorecardLink() {
  return (
    <Link href="/standards" className="text-xs text-indigo-600 hover:text-indigo-700">
      Last 8 weeks
    </Link>
  );
}
