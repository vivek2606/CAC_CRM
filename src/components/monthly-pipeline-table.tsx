import { formatCompactCurrency } from "@/lib/format";
import type { MonthlyPipeline, PipelineCell } from "@/lib/monthly-pipeline";

const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const sum = (cells: PipelineCell[]) =>
  cells.reduce((t, c) => ({ open: t.open + c.open, openValue: t.openValue + c.openValue, converted: t.converted + c.converted, won: t.won + c.won, wonValue: t.wonValue + c.wonValue }), {
    open: 0,
    openValue: 0,
    converted: 0,
    won: 0,
    wonValue: 0,
  });

const METRICS = [
  { key: "open", title: "Open deals", note: "at each month's end (this month: now)", show: (c: PipelineCell) => [c.open, c.openValue] as const },
  { key: "converted", title: "Converted from lead", note: "deals converted in the month", show: (c: PipelineCell) => [c.converted, null] as const },
  { key: "won", title: "Won deals", note: "by invoice date", show: (c: PipelineCell) => [c.won, c.wonValue] as const },
] as const;

function Cell({ n, v }: { n: number; v: number | null }) {
  if (!n) return <span className="text-slate-300">-</span>;
  return (
    <>
      <span className="font-medium text-slate-800">{n}</span>
      {v != null && <span className="block text-[10px] text-slate-400">{formatCompactCurrency(v)}</span>}
    </>
  );
}

// One small table per measure: sales people down, months across, totals.
export function MonthlyPipelineTables({ data }: { data: MonthlyPipeline }) {
  const { months, people, cells } = data;
  const at = (pid: string, i: number) => cells.get(`${pid}|${i}`)!;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {METRICS.map((m) => (
        <div key={m.key} className="overflow-x-auto">
          <h3 className="text-xs font-semibold text-slate-700">
            {m.title} <span className="font-normal text-slate-400">- {m.note}</span>
          </h3>
          <table className="mt-1 w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-2 font-medium">Sales person</th>
                {months.map((mo) => (
                  <th key={mo.toISOString()} className="px-1.5 py-1.5 text-right font-medium">
                    {monthLabel(mo)}
                  </th>
                ))}
                {m.key !== "open" && months.length > 1 && <th className="px-1.5 py-1.5 text-right font-medium">Total</th>}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const row = months.map((_, i) => at(p.id, i));
                const t = sum(row);
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate-700">{p.name}</td>
                    {row.map((c, i) => {
                      const [n, v] = m.show(c);
                      return (
                        <td key={i} className="px-1.5 py-1.5 text-right tabular-nums align-top">
                          <Cell n={n} v={v} />
                        </td>
                      );
                    })}
                    {m.key !== "open" && months.length > 1 && (
                      <td className="px-1.5 py-1.5 text-right tabular-nums align-top bg-slate-50">
                        <Cell n={m.show(t)[0]} v={m.show(t)[1]} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td className="py-1.5 pr-2 text-slate-800">Team</td>
                {months.map((_, i) => {
                  const [n, v] = m.show(sum(people.map((p) => at(p.id, i))));
                  return (
                    <td key={i} className="px-1.5 py-1.5 text-right tabular-nums align-top">
                      <Cell n={n} v={v} />
                    </td>
                  );
                })}
                {m.key !== "open" && months.length > 1 && (
                  <td className="px-1.5 py-1.5 text-right tabular-nums align-top bg-slate-50">
                    {(() => {
                      const [n, v] = m.show(sum(people.flatMap((p) => months.map((_, i) => at(p.id, i)))));
                      return <Cell n={n} v={v} />;
                    })()}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
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
