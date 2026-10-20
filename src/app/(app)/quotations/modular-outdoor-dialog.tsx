"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { MAX_COMBINED_CODE, MAX_MODULE_CODE, MAX_MODULES, VRF_SERIES, kW, parseVrfModel, suggestBreakup, vrfModelName } from "@/lib/modular-outdoor";
import type { ModelOption } from "./builder";

export type ModularModule = { productId: string; model: string; rate: string };
export type ModularResult = { description: string; modules: ModularModule[]; total: number };

type Module = { productId: string; rate: string };

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => {
  const n = Number(String(v).replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// A modular VRF outdoor (over 85 kW, up to 3 modules of up to 85 kW each):
// pick its modules from the product list - a break-up adding up to the
// capacity is suggested - and its price is the sum of their rates.
export function ModularOutdoorDialog({
  options,
  rateFor,
  initial,
  onConfirm,
  onCancel,
}: {
  options: ModelOption[];
  // The quote rate for a product (as the builder suggests it).
  rateFor: (o: ModelOption) => number | null;
  initial: { series: string | null; code: number; modules?: ModularModule[] };
  onConfirm: (r: ModularResult) => void;
  onCancel: () => void;
}) {
  const [series, setSeries] = useState<string>(initial.series ?? initial.modules?.map((m) => parseVrfModel(m.model)?.series).find(Boolean) ?? "MVC");
  const [capacity, setCapacity] = useState(String(kW(initial.code)));
  const code = Math.round(num(capacity) * 10);

  // The series' single modules (up to 85 kW) - per capacity, the code with
  // the most stock first.
  const modulesOf = (s: string) =>
    options
      .filter((o) => !o.id.startsWith("tentative:"))
      .map((o) => ({ o, v: parseVrfModel(o.model) }))
      .filter(({ v }) => v && v.series === s && v.code <= MAX_MODULE_CODE)
      .sort((a, b) => b.v!.code - a.v!.code || b.o.stock - a.o.stock)
      .map(({ o, v }) => ({ o, code: v!.code }));
  const candidates = useMemo(() => modulesOf(series), [series, options]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggest = (s: string, c: number): Module[] => {
    const list = modulesOf(s);
    const caps = suggestBreakup(c, list.map((m) => m.code)) ?? [];
    return caps.map((cap) => {
      const o = list.find((m) => m.code === cap)!.o;
      const r = rateFor(o);
      return { productId: o.id, rate: r != null ? String(r) : "" };
    });
  };
  const [mods, setMods] = useState<Module[]>(() =>
    initial.modules?.length ? initial.modules.map((m) => ({ productId: m.productId, rate: m.rate })) : suggest(initial.series ?? "MVC", initial.code),
  );
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(options.map((o) => [o.id, o]));
  const capOf = (id: string) => parseVrfModel(byId.get(id)?.model ?? "")?.code ?? 0;
  const selectOptions = candidates.map(({ o, code: c }) => ({
    id: o.id,
    label: `${vrfModelName(series, c)} - ${kW(c)} kW (${o.code})`,
    hint: o.stock > 0 ? `${o.stock} in stock` : o.inTransit > 0 ? `${o.inTransit} in transit` : "no stock",
    hintTone: o.stock > 0 ? ("good" as const) : ("muted" as const),
  }));
  const totalCap = mods.reduce((s, m) => s + capOf(m.productId), 0);
  const total = Math.round(mods.reduce((s, m) => s + num(m.rate), 0) * 100) / 100;
  const set = (i: number, patch: Partial<Module>) => setMods((ms) => ms.map((m, k) => (k === i ? { ...m, ...patch } : m)));

  const confirm = () => {
    setError(null);
    if (code <= MAX_MODULE_CODE || code > MAX_COMBINED_CODE) return setError(`A modular outdoor is over ${kW(MAX_MODULE_CODE)} kW and up to ${kW(MAX_COMBINED_CODE)} kW.`);
    if (mods.length < 2 || mods.some((m) => !m.productId)) return setError("Pick each module (2 or 3).");
    if (mods.some((m) => !(num(m.rate) > 0))) return setError("Enter the rate of each module.");
    const names = mods.map((m) => vrfModelName(series, capOf(m.productId)));
    onConfirm({
      // Only the combined model is printed - the modules stay on screen.
      description: `${vrfModelName(series, code)} - Modular VRF Outdoor Unit, ${kW(code)} kW`,
      modules: mods.map((m, i) => ({ productId: m.productId, model: names[i], rate: m.rate })),
      total,
    });
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900">Modular outdoor - {vrfModelName(series, code)} ({kW(code)} kW)</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">
          VRF outdoors combine up to {MAX_MODULES} modules of up to {kW(MAX_MODULE_CODE)} kW each. Pick the modules - the price is the sum of their rates. The document
          shows only the combined model.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Series</span>
            <select
              value={series}
              onChange={(e) => {
                setSeries(e.target.value);
                setMods(suggest(e.target.value, code));
              }}
              className={input}
            >
              {VRF_SERIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Total capacity (kW)</span>
            <div className="flex gap-2">
              <input inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={input} />
              <button type="button" onClick={() => setMods(suggest(series, code))} className="whitespace-nowrap rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Suggest break-up
              </button>
            </div>
          </label>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-amber-700">No {series} modules in the product list.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_150px_24px] gap-2 text-[11px] font-medium text-slate-500">
              <span>Module</span>
              <span className="text-right">Rate (₦)</span>
              <span />
            </div>
            {mods.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_150px_24px] items-start gap-2">
                <SearchableSelect
                  options={selectOptions}
                  value={m.productId}
                  placeholder={`Module ${i + 1} - search…`}
                  onSelect={(o) => {
                    const opt = o ? byId.get(o.id) : undefined;
                    const r = opt ? rateFor(opt) : null;
                    set(i, { productId: o?.id ?? "", rate: r != null ? String(r) : m.rate });
                  }}
                />
                <input inputMode="decimal" value={m.rate} onChange={(e) => set(i, { rate: e.target.value })} placeholder="0.00" className={`${input} text-right`} />
                <button type="button" title="Remove" onClick={() => setMods((ms) => ms.filter((_, k) => k !== i))} className="mt-2 text-slate-400 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {mods.length < MAX_MODULES && (
              <button type="button" onClick={() => setMods((ms) => [...ms, { productId: "", rate: "" }])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                <Plus className="h-4 w-4" />
                Add module
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className={totalCap === code ? "text-emerald-700" : "text-amber-700"}>
            Modules: {kW(totalCap)} kW {totalCap === code ? "✓" : `- ${totalCap < code ? "short of" : "over"} ${kW(code)} kW`}
          </span>
          <span className="font-semibold text-slate-900">Price: {naira(total)}</span>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:text-slate-900">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Add to quotation
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
