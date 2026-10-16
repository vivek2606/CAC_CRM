import { formatCompactCurrency } from "@/lib/format";
import type { MonthlyPipeline, PipelineCell } from "@/lib/monthly-pipeline";
import { ExportCsvButton } from "@/components/export-csv-button";

const sum = (cells: PipelineCell[]) =>
  cells.reduce((t, c) => ({ open: t.open + c.open, openValue: t.openValue + c.openValue, converted: t.converted + c.converted, won: t.won + c.won, wonValue: t.wonValue + c.wonValue }), {
    open: 0,
    openValue: 0,
    converted: 0,
    won: 0,
    wonValue: 0,
  });

const monthLong = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// One table: each sales person's months, then their total; the team's at the
// end. Open deals = still open at the month's end (this month: now); the
// total row shows the latest month's open deals.
export function MonthlyPipelineTables({ data, filename = "deals-by-sales-person.csv" }: { data: MonthlyPipeline; filename?: string }) {
  const { months, people, cells } = data;
  const at = (pid: string, i: number) => cells.get(`${pid}|${i}`)!;
  const lastIdx = months.length - 1;
  const groups = [
    ...people.map((p) => ({ key: p.id, name: p.name, rows: months.map((_, i) => at(p.id, i)), team: false })),
    { key: "team", name: "Team", rows: months.map((_, i) => sum(people.map((p) => at(p.id, i)))), team: true },
  ];
  const totalOf = (rows: PipelineCell[]) => {
    const t = sum(rows);
    return { ...t, open: rows[lastIdx]?.open ?? 0, openValue: rows[lastIdx]?.openValue ?? 0 };
  };
  const money = (v: number) => (v ? formatCompactCurrency(v) : "-");
  const num = (n: number) => (n ? String(n) : "-");
  const td = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
  const csvRows: (string | number)[][] = groups.flatMap((g) => [
    ...g.rows.map((c, i) => [g.name, monthLong(months[i]), c.open, Math.round(c.openValue), c.converted, c.won, Math.round(c.wonValue)]),
    (() => {
      const t = totalOf(g.rows);
      return [g.name, "Total", t.open, Math.round(t.openValue), t.converted, t.won, Math.round(t.wonValue)];
    })(),
  ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ExportCsvButton
          filename={filename}
          headers={["Sales person", "Month", "Open deals", "Open value", "Converted from lead", "Won deals", "Won value"]}
          rows={csvRows}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm" data-own-head>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide">
              <th className="px-3 py-2 font-medium bg-slate-100 text-slate-600">Sales person</th>
              <th className="px-3 py-2 font-medium bg-slate-100 text-slate-600">Month</th>
              <th className="px-3 py-2 text-right font-medium bg-sky-100 text-sky-800">Open deals</th>
              <th className="px-3 py-2 text-right font-medium bg-sky-100 text-sky-800">Open value</th>
              <th className="px-3 py-2 text-right font-medium bg-violet-100 text-violet-800">Converted from lead</th>
              <th className="px-3 py-2 text-right font-medium bg-emerald-100 text-emerald-800">Won deals</th>
              <th className="px-3 py-2 text-right font-medium bg-emerald-100 text-emerald-800">Won value</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const t = totalOf(g.rows);
            return (
              <tbody key={g.key} className={`border-t-2 border-slate-200 ${g.team ? "bg-indigo-50/40" : ""}`}>
                {g.rows.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {i === 0 && (
                      <td rowSpan={g.rows.length + 1} className={`px-3 py-1.5 align-top font-medium ${g.team ? "text-indigo-900" : "text-slate-800"}`}>
                        {g.name}
                      </td>
                    )}
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{monthLong(months[i])}</td>
                    <td className={`${td} bg-sky-50/40 ${c.open ? "text-sky-700" : "text-slate-300"}`}>{num(c.open)}</td>
                    <td className={`${td} bg-sky-50/40 ${c.openValue ? "text-sky-600" : "text-slate-300"}`}>{money(c.openValue)}</td>
                    <td className={`${td} bg-violet-50/40 ${c.converted ? "text-violet-700" : "text-slate-300"}`}>{num(c.converted)}</td>
                    <td className={`${td} bg-emerald-50/40 ${c.won ? "text-emerald-700" : "text-slate-300"}`}>{num(c.won)}</td>
                    <td className={`${td} bg-emerald-50/40 ${c.wonValue ? "text-emerald-600" : "text-slate-300"}`}>{money(c.wonValue)}</td>
                  </tr>
                ))}
                {months.length > 1 && (
                  <tr className={`border-t border-slate-200 font-semibold ${g.team ? "bg-indigo-100/70 text-indigo-950" : "bg-slate-50 text-slate-900"}`}>
                    <td className="px-3 py-1.5 text-xs uppercase tracking-wide text-slate-500">Total</td>
                    <td className={`${td} text-sky-800`} title={`Open at the end of ${monthLong(months[lastIdx])}`}>{num(t.open)}</td>
                    <td className={`${td} text-sky-800`}>{money(t.openValue)}</td>
                    <td className={`${td} text-violet-800`}>{num(t.converted)}</td>
                    <td className={`${td} text-emerald-800`}>{num(t.won)}</td>
                    <td className={`${td} text-emerald-800`}>{money(t.wonValue)}</td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

// The dashboard's one-month view: a row per sales person with the three.
export function PipelineThisMonth({ data }: { data: MonthlyPipeline }) {
  const { people, cells } = data;
  const rows = people.map((p) => ({ p, c: cells.get(`${p.id}|0`)! }));
  const t = sum(rows.map((r) => r.c));
  const td = "px-2 py-1.5 text-right tabular-nums";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-3 font-medium">Sales person</th>
          <th className="px-2 py-2 text-right font-medium">Open deals</th>
          <th className="px-2 py-2 text-right font-medium">Open value</th>
          <th className="px-2 py-2 text-right font-medium">Converted from lead</th>
          <th className="px-2 py-2 text-right font-medium">Won</th>
          <th className="px-2 py-2 text-right font-medium">Won value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ p, c }) => (
          <tr key={p.id} className="border-t border-slate-100">
            <td className="py-1.5 pr-3 text-slate-700">{p.name}</td>
            <td className={td}>{c.open || "-"}</td>
            <td className={td}>{c.openValue ? formatCompactCurrency(c.openValue) : "-"}</td>
            <td className={td}>{c.converted || "-"}</td>
            <td className={td}>{c.won || "-"}</td>
            <td className={td}>{c.wonValue ? formatCompactCurrency(c.wonValue) : "-"}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
            <td className="py-1.5 pr-3">Team</td>
            <td className={td}>{t.open}</td>
            <td className={td}>{formatCompactCurrency(t.openValue)}</td>
            <td className={td}>{t.converted}</td>
            <td className={td}>{t.won}</td>
            <td className={td}>{formatCompactCurrency(t.wonValue)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
