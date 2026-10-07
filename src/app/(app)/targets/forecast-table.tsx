import Link from "next/link";
import { formatCurrency } from "@/lib/format";

export type ForecastRow = {
  userId: string;
  name: string;
  target: number;
  won: number;
  openCount: number;
  openValue: number;
  weighted: number;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

function status(likely: number, target: number) {
  const p = pct(likely, target);
  if (p == null) return { label: "No target", cls: "bg-slate-100 text-slate-600" };
  if (p >= 100) return { label: "On track", cls: "bg-emerald-100 text-emerald-800" };
  if (p >= 80) return { label: "At risk", cls: "bg-amber-100 text-amber-800" };
  return { label: "Behind", cls: "bg-rose-100 text-rose-800" };
}

// Forecast vs target: won so far + open deals expected to close this month
// weighted by their probability = likely by month end.
export function ForecastTable({ rows, monthLabel, isCurrent, monthParam }: { rows: ForecastRow[]; monthLabel: string; isCurrent: boolean; monthParam: string }) {
  const total = rows.reduce(
    (t, r) => ({ target: t.target + r.target, won: t.won + r.won, openCount: t.openCount + r.openCount, openValue: t.openValue + r.openValue, weighted: t.weighted + r.weighted }),
    { target: 0, won: 0, openCount: 0, openValue: 0, weighted: 0 },
  );
  const line = (r: Omit<ForecastRow, "userId" | "name">, name: string, userId: string | null, bold = false) => {
    const likely = r.won + r.weighted;
    const s = status(likely, r.target);
    const gap = r.target - likely;
    return (
      <tr key={userId ?? "total"} className={bold ? "border-t-2 border-slate-300 font-semibold text-slate-900" : "text-slate-700"}>
        <td className="py-1.5 pr-2 whitespace-nowrap">{name}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(r.target)}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(r.won)}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">
          {userId ? (
            <Link href={`/deals?owner=${userId}`} className="hover:text-indigo-600">
              {r.openCount} · {formatCurrency(r.openValue)}
            </Link>
          ) : (
            `${r.openCount} · ${formatCurrency(r.openValue)}`
          )}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(r.weighted)}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(likely)}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{pct(likely, r.target) == null ? "—" : `${pct(likely, r.target)}%`}</td>
        <td className={`py-1.5 px-2 text-right tabular-nums ${gap > 0 ? "text-rose-700" : "text-emerald-700"}`}>{r.target > 0 ? formatCurrency(Math.abs(gap)) : "—"}</td>
        <td className="py-1.5 pl-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
        </td>
      </tr>
    );
  };
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900">Forecast vs target, {monthLabel}</h2>
      <p className="text-xs text-slate-500 mb-3">
        Likely by month end = won so far + open deals expected to close in {monthLabel} × their probability
        {isCurrent ? " (open deals already past their expected close date are counted too)" : ""}. Gap is what&apos;s still needed to reach target (red) or the
        expected surplus (green).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-month={monthParam}>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-2 font-medium">Sales person</th>
              <th className="py-2 px-2 font-medium text-right">Target</th>
              <th className="py-2 px-2 font-medium text-right">Won so far</th>
              <th className="py-2 px-2 font-medium text-right">Open deals due</th>
              <th className="py-2 px-2 font-medium text-right">Weighted</th>
              <th className="py-2 px-2 font-medium text-right">Likely by month end</th>
              <th className="py-2 px-2 font-medium text-right">% of target</th>
              <th className="py-2 px-2 font-medium text-right">Gap</th>
              <th className="py-2 pl-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => line(r, r.name, r.userId))}
            {rows.length > 1 && line(total, "Team", null, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
