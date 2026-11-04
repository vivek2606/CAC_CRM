"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SlaSettings } from "@/lib/service-sla";
import { saveSlaSettings } from "./actions";

const field = "w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm";

// The Head's service level targets (hours by priority, days to close).
export function SlaSettingsForm({ sla }: { sla: SlaSettings }) {
  const router = useRouter();
  const [v, setV] = useState(sla);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const n = (x: string) => Math.max(0.5, Number(x) || 0);
  const row = (label: string, key: "assignHours" | "attendHours" | "resolveHours") => (
    <tr>
      <td className="py-1.5 pr-3 text-sm text-slate-700">{label}</td>
      {(["NORMAL", "URGENT"] as const).map((p) => (
        <td key={p} className="py-1.5 pr-3">
          <input type="number" min={0.5} step={0.5} value={v[key][p]} onChange={(e) => setV({ ...v, [key]: { ...v[key], [p]: n(e.target.value) } })} className={field} /> h
        </td>
      ))}
    </tr>
  );
  return (
    <div className="space-y-3">
      <table>
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="pr-3 font-medium" />
            <th className="pr-3 font-medium">Normal</th>
            <th className="pr-3 font-medium">Urgent</th>
          </tr>
        </thead>
        <tbody>
          {row("Assign a technician within", "assignHours")}
          {row("First visit (or remote fix) within", "attendHours")}
          {row("Resolve within", "resolveHours")}
          <tr>
            <td className="py-1.5 pr-3 text-sm text-slate-700">Close after resolving within</td>
            <td className="py-1.5 pr-3" colSpan={2}>
              <input type="number" min={1} value={v.closeDays} onChange={(e) => setV({ ...v, closeDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className={field} /> days
            </td>
          </tr>
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveSlaSettings(v);
              setMsg(res.error ?? "Saved.");
              router.refresh();
            })
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Save targets
        </button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
