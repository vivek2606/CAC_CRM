import { formatCompactCurrency } from "@/lib/format";

// Closed-won revenue and conversion rate by lead source - a horizontal bar
// list (not a pie of raw lead count) since the metric that actually matters
// here is revenue-per-source, and a bar sized by that plus a text
// conversion-rate label avoids stacking two different units (currency,
// percent) onto one dual-axis chart.
export type LeadSourceRow = { source: string; count: number; conversionRate: number; wonRevenue: number; fill: string };

export function LeadSourceChart({ data }: { data: LeadSourceRow[] }) {
  const maxRevenue = Math.max(1, ...data.map((d) => d.wonRevenue));

  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.source} className="flex items-center gap-3">
          <span className="text-sm text-slate-700 w-28 shrink-0 truncate">{d.source}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.wonRevenue / maxRevenue) * 100}%`, backgroundColor: d.fill }}
            />
          </div>
          <span className="text-xs font-medium text-slate-500 w-48 text-right shrink-0">
            {formatCompactCurrency(d.wonRevenue)} won · {d.conversionRate}% conv ({d.count})
          </span>
        </li>
      ))}
    </ul>
  );
}
