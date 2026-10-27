"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent, type ReactNode } from "react";
import {
  BarChartHorizontal,
  Box,
  ChartArea,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartPie,
  ChartScatter,
  Columns3,
  Donut,
  Filter,
  Funnel as FunnelIcon,
  Grid3x3,
  GripVertical,
  ImageDown,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Percent,
  Radar as RadarIcon,
  Rows3,
  Save,
  Sigma,
  Trash2,
  X,
  BarChart3,
} from "lucide-react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { formatCurrency } from "@/lib/format";
import type { RegisterRow } from "./register-table";
import {
  FIELDS,
  MEASURES,
  applyFilters,
  buildPivot,
  distinctValues,
  fieldLabel,
  isTime,
  labelOf,
  measureInfo,
  valueOf,
  type Measure,
  type PivotField,
  type PivotFilter,
  type SortMode,
} from "./pivot-engine";
import { PivotChart, type ChartType } from "./pivot-chart";

export type { PivotField } from "./pivot-engine";

// Chart studio over the lines the register table is showing: drag fields
// into Filters / Rows / Columns / Values (or click them), pick a chart, and
// read the pivot table under it. Clicking a row (bar, slice, cell) filters
// the register table. Layouts can be saved as views (this browser).

type Config = {
  rows: PivotField[];
  col: PivotField | null;
  values: Measure[];
  filters: PivotFilter[];
  chart: ChartType;
  top: number;
  labels: boolean;
  sort: SortMode;
  size: "s" | "m" | "l";
  // Simple: three plain choices and the common charts. Advanced: drag and
  // drop, filters on any field, several values, every chart.
  mode: "simple" | "advanced";
};
const DEFAULT: Config = {
  rows: ["category"],
  col: null,
  values: ["amount"],
  filters: [],
  chart: "bar",
  top: 20,
  labels: true,
  sort: "value-desc",
  size: "m",
  mode: "simple",
};
const SIMPLE_CHARTS: ChartType[] = ["bar", "column", "line", "donut", "treemap"];
const PRESETS: { name: string; cfg: Partial<Config> }[] = [
  { name: "Product mix - donut", cfg: { rows: ["category"], col: null, values: ["amount"], chart: "donut" } },
  { name: "Monthly sales by product type - stacked", cfg: { rows: ["month"], col: "category", values: ["amount"], chart: "column" } },
  { name: "Monthly sales trend - line", cfg: { rows: ["month"], col: null, values: ["amount"], chart: "line" } },
  { name: "Product type share by month - 100%", cfg: { rows: ["month"], col: "category", values: ["amount"], chart: "percent" } },
  { name: "Sales person by year - clustered", cfg: { rows: ["salesPerson"], col: "year", values: ["amount"], chart: "clustered" } },
  { name: "Top 20 customers - bar", cfg: { rows: ["accountName"], col: null, values: ["amount"], chart: "bar", top: 20 } },
  { name: "Customers by size - treemap", cfg: { rows: ["accountName"], col: null, values: ["amount"], chart: "treemap", top: 30 } },
  { name: "Product type x month - heatmap", cfg: { rows: ["category"], col: "month", values: ["amount"], chart: "heatmap" } },
  { name: "Products: amount vs qty - scatter", cfg: { rows: ["product"], col: null, values: ["amount", "qty"], chart: "scatter", top: 50 } },
  { name: "Sales person profile - radar", cfg: { rows: ["category"], col: "salesPerson", values: ["amount"], chart: "radar" } },
  { name: "Companies - 3D columns", cfg: { rows: ["company"], col: null, values: ["amount"], chart: "column3d" } },
];
const CHARTS: { key: ChartType; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "bar", label: "Bar", icon: BarChartHorizontal },
  { key: "column", label: "Stacked column", icon: ChartColumnStacked },
  { key: "clustered", label: "Clustered column", icon: ChartColumn },
  { key: "percent", label: "100% stacked", icon: Percent },
  { key: "column3d", label: "3D column", icon: Box },
  { key: "line", label: "Line", icon: ChartLine },
  { key: "area", label: "Area", icon: ChartArea },
  { key: "donut", label: "Donut", icon: Donut },
  { key: "pie", label: "Pie", icon: ChartPie },
  { key: "treemap", label: "Treemap", icon: LayoutGrid },
  { key: "funnel", label: "Funnel", icon: FunnelIcon },
  { key: "radar", label: "Radar", icon: RadarIcon },
  { key: "heatmap", label: "Heatmap", icon: Grid3x3 },
  { key: "scatter", label: "Scatter", icon: ChartScatter },
];
const HEIGHTS = { s: 260, m: 360, l: 520 };
const STORE = "cac-register-pivot-v2";
const VIEWS = "cac-register-pivot-views-v1";

type Drag = { kind: "field"; key: PivotField; from: Zone | null } | { kind: "measure"; key: Measure; from: Zone | null };
type Zone = "filters" | "rows" | "col" | "values";
const MIME = "application/x-cac-pivot";

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};

export function RegisterPivot({
  rows,
  showSalesPerson,
  onPick,
  side,
}: {
  rows: RegisterRow[];
  showSalesPerson: boolean;
  onPick: (field: PivotField, key: string) => void;
  // The register's own filters (period, sales person, type, entity), shown
  // at the top of the side panel.
  side?: ReactNode;
}) {
  const fields = showSalesPerson ? FIELDS : FIELDS.filter((f) => f.key !== "salesPerson");
  const [cfg, setCfg] = useState<Config>(DEFAULT);
  const [views, setViews] = useState<{ name: string; cfg: Config }[]>([]);
  const [full, setFull] = useState(false);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState<Drag | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  // The last layout and the saved views come back (this browser only).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- read once after mount (localStorage isn't there on the server) */
    setCfg({ ...DEFAULT, ...load<Partial<Config>>(STORE, {}) });
    setViews(load(VIEWS, []));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const update = (f: (c: Config) => Config) =>
    setCfg((c) => {
      const next = f(c);
      save(STORE, next);
      return next;
    });
  const set = (patch: Partial<Config>) => update((c) => ({ ...c, ...patch }));

  // Moving fields between the zones.
  const addField = (zone: Zone, key: PivotField) =>
    update((c) => {
      const { filters } = c;
      let { rows: r, col } = c;
      if (zone === "filters") return filters.some((f) => f.field === key) ? c : { ...c, filters: [...filters, { field: key, include: null }] };
      r = r.filter((x) => x !== key);
      if (col === key) col = null;
      if (zone === "rows") r = r.length >= 2 ? [r[0], key] : [...r, key];
      if (zone === "col") col = key;
      return { ...c, rows: r, col };
    });
  const removeField = (zone: Zone, key: string) =>
    update((c) =>
      zone === "rows"
        ? { ...c, rows: c.rows.filter((x) => x !== key) }
        : zone === "col"
          ? { ...c, col: null }
          : zone === "filters"
            ? { ...c, filters: c.filters.filter((f) => f.field !== key) }
            : { ...c, values: c.values.length > 1 ? c.values.filter((x) => x !== key) : c.values },
    );
  const addMeasure = (key: Measure) => update((c) => (c.values.includes(key) ? c : { ...c, values: [...c.values, key].slice(-4) }));
  const drop = (zone: Zone | null) => (e: DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(MIME);
    setDragging(null);
    if (!raw) return;
    const d = JSON.parse(raw) as Drag;
    if (zone === null) {
      if (d.from) removeField(d.from, d.key);
      return;
    }
    if (d.kind === "measure") {
      if (zone === "values") addMeasure(d.key);
      return;
    }
    if (zone === "values") return;
    if (d.from && d.from !== zone && d.from !== "filters") removeField(d.from, d.key);
    addField(zone, d.key);
  };
  const accepts = (zone: Zone | null) => !dragging || zone === null || (dragging.kind === "measure" ? zone === "values" : zone !== "values");
  const dragProps = (d: Drag) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify(d));
      e.dataTransfer.effectAllowed = "move";
      setDragging(d);
    },
    onDragEnd: () => setDragging(null),
  });

  const lines = useMemo(() => applyFilters(rows, cfg.filters), [rows, cfg.filters]);
  const spec = { rows: cfg.rows, col: cfg.col, values: cfg.values, filters: cfg.filters, sort: cfg.sort };
  const pivot = useMemo(() => buildPivot(lines, spec), [lines, cfg.rows, cfg.col, cfg.values, cfg.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowField = cfg.rows[0] ?? null;
  const row2 = cfg.rows[1] ?? null;
  const pickRow = (k: string) => {
    if (rowField && rowField !== "quarter") onPick(rowField, k);
  };

  const downloadPng = () => {
    // The chart's own drawing (the largest SVG - legend icons are SVGs too),
    // with the legend (HTML) drawn in under it.
    const svgs = [...(chartRef.current?.querySelectorAll("svg.recharts-surface") ?? [])] as SVGSVGElement[];
    const area = (el: SVGSVGElement) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
    const svg = svgs.sort((a, b) => area(b) - area(a))[0];
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const legend = [...(chartRef.current?.querySelectorAll(".recharts-legend-item") ?? [])].map((li) => ({
      text: li.textContent ?? "",
      color: li.querySelector("path, rect")?.getAttribute("fill") ?? "#94a3b8",
    }));
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const top = 36;
      const perRow = Math.max(1, Math.floor(width / 170));
      const legendH = legend.length ? Math.ceil(legend.length / perRow) * 20 + 12 : 0;
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = (height + top + legendH) * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height + top + legendH);
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 14px sans-serif";
      ctx.fillText(title, 8, 22);
      ctx.drawImage(img, 0, top, width, height);
      ctx.font = "12px sans-serif";
      legend.forEach((l, i) => {
        const x = 8 + (i % perRow) * 170;
        const y = top + height + 8 + Math.floor(i / perRow) * 20;
        ctx.fillStyle = l.color;
        ctx.fillRect(x, y + 2, 10, 10);
        ctx.fillStyle = "#334155";
        ctx.fillText(l.text.length > 22 ? `${l.text.slice(0, 21)}…` : l.text, x + 16, y + 11);
      });
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${title.replace(/[^A-Za-z0-9]+/g, "-")}.png`;
      a.click();
    };
    img.src = url;
  };
  const saveView = () => {
    const name = window.prompt("Name this view", title)?.trim();
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, cfg }];
    setViews(next);
    save(VIEWS, next);
  };
  const deleteView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    save(VIEWS, next);
  };

  if (rows.length === 0) return null;
  const m0 = cfg.values[0];
  const title = `${measureInfo(m0).label} by ${rowField ? fieldLabel(rowField).toLowerCase() : "all"}${cfg.col ? ` and ${fieldLabel(cfg.col).toLowerCase()}` : ""}`;
  const select = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs";
  const chip = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium cursor-grab active:cursor-grabbing select-none";
  const fieldChip = `${chip} border-slate-200 bg-white text-slate-700 hover:border-indigo-300`;
  const measureChip = `${chip} border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400`;
  const height = full ? Math.max(400, (typeof window !== "undefined" ? window.innerHeight : 800) - 220) : HEIGHTS[cfg.size];

  const zone = (z: Zone, label: string, icon: ComponentType<{ className?: string }>, children: ReactNode, hint: string) => {
    const Icon = icon;
    const ok = accepts(z);
    return (
      <div
        onDragOver={(e) => ok && e.preventDefault()}
        onDrop={drop(z)}
        className={`min-h-[72px] rounded-lg border-2 border-dashed p-2 transition-colors ${dragging ? (ok ? "border-indigo-300 bg-indigo-50/50" : "border-slate-100 opacity-50") : "border-slate-200 bg-slate-50/50"}`}
      >
        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <Icon className="h-3 w-3" />
          {label}
        </p>
        <div className="flex flex-wrap gap-1.5">{children}</div>
        {!children || (Array.isArray(children) && children.length === 0) ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
      </div>
    );
  };
  const placed = (z: Zone, key: PivotField, extra?: ReactNode) => (
    <span key={key} {...dragProps({ kind: "field", key, from: z })} className={`${fieldChip} border-indigo-200 bg-indigo-50 text-indigo-800`}>
      <GripVertical className="h-3 w-3 opacity-50" />
      {fieldLabel(key)}
      {extra}
      <button type="button" onClick={() => removeField(z, key)} className="ml-0.5 text-indigo-400 hover:text-rose-600" aria-label={`Remove ${fieldLabel(key)}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );

  // The pivot table (all the Values; Columns across).
  const cols = cfg.col ? pivot.colList.slice(0, 60) : [];
  const fmt = (m: Measure, n: number) => (measureInfo(m).money ? formatCurrency(n) : n.toLocaleString("en-NG", { maximumFractionDigits: 2 }));
  const additive = (m: Measure) => m === "amount" || m === "qty" || m === "lines";
  const share = (n: number) => {
    const g = valueOf(pivot.grand, m0);
    return g ? `${((n / g) * 100).toFixed(1)}%` : "—";
  };
  const csvHeaders = [
    rowField ? fieldLabel(rowField) : "",
    ...(row2 ? [fieldLabel(row2)] : []),
    ...cols.flatMap((c) => cfg.values.map((m) => `${labelOf(cfg.col, c)} - ${measureInfo(m).short}`)),
    ...cfg.values.map((m) => `Total - ${measureInfo(m).short}`),
  ];
  const csvRows: (string | number)[][] = [];
  for (const g of pivot.rowList) {
    csvRows.push([
      labelOf(rowField, g.key),
      ...(row2 ? [""] : []),
      ...cols.flatMap((c) => cfg.values.map((m) => valueOf(g.cells.get(c), m))),
      ...cfg.values.map((m) => valueOf(g.total, m)),
    ]);
    for (const s of g.subs)
      csvRows.push([
        labelOf(rowField, g.key),
        labelOf(row2, s.key),
        ...cols.flatMap((c) => cfg.values.map((m) => valueOf(s.cells.get(c), m))),
        ...cfg.values.map((m) => valueOf(s.total, m)),
      ]);
  }
  csvRows.push([
    "Grand total",
    ...(row2 ? [""] : []),
    ...cols.flatMap((c) => cfg.values.map((m) => valueOf(pivot.colTotals.get(c), m))),
    ...cfg.values.map((m) => valueOf(pivot.grand, m)),
  ]);

  const chartBox = (
    <div ref={chartRef}>
      <PivotChart
        pivot={pivot}
        rowField={rowField}
        colField={cfg.col}
        values={cfg.values}
        type={cfg.chart}
        top={cfg.top}
        labels={cfg.labels}
        height={height}
        onPick={pickRow}
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Header: presets, saved views. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="mr-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          Chart studio
        </h2>
        <span className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
          {(["simple", "advanced"] as const).map((md) => (
            <button
              key={md}
              type="button"
              onClick={() =>
                set({
                  mode: md,
                  ...(md === "simple"
                    ? { filters: [], values: [cfg.values[0]], rows: cfg.rows.slice(0, 1), chart: SIMPLE_CHARTS.includes(cfg.chart) ? cfg.chart : "bar" }
                    : {}),
                })
              }
              className={`rounded-md px-2.5 py-1 ${cfg.mode === md ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {md === "simple" ? "Simple" : "Advanced"}
            </button>
          ))}
        </span>
        <button type="button" onClick={() => setHelp(!help)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          {help ? "Hide help" : "How to use"}
        </button>
        <span className="ml-auto" />
        {cfg.mode === "advanced" && (
          <select
            value=""
            onChange={(e) => {
              const p = PRESETS.find((x) => x.name === e.target.value);
              if (p) update((c) => ({ ...c, filters: [], ...p.cfg }));
            }}
            className={select}
          >
            <option value="">Quick charts…</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {cfg.mode === "advanced" && (
          <>
            <select
              value=""
              onChange={(e) => {
                const v = views.find((x) => x.name === e.target.value);
                if (v) update(() => ({ ...DEFAULT, ...v.cfg }));
              }}
              className={select}
              disabled={!views.length}
            >
              <option value="">{views.length ? `My views (${views.length})…` : "No saved views"}</option>
              {views.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={saveView}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save view
            </button>
            {views.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && window.confirm(`Delete the view "${e.target.value}"?`) && deleteView(e.target.value)}
                className={`${select} text-rose-600`}
              >
                <option value="">Delete a view…</option>
                {views.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <button type="button" onClick={() => update((c) => ({ ...DEFAULT, mode: c.mode }))} className="text-xs text-slate-500 hover:text-slate-800">
          Reset
        </button>
      </div>

      {help && (
        <div className="border-b border-slate-100 bg-indigo-50/40 px-4 py-3 text-xs text-slate-700">
          {cfg.mode === "simple" ? (
            <ol className="list-decimal space-y-1 pl-4">
              <li>Set the period and filters on the left (the table below follows them too).</li>
              <li>
                <b>Compare by</b> - what each bar is (product type, customer, month…). <b>Split by</b> (optional) colours each bar by a second field.
              </li>
              <li>
                <b>Measure</b> - what to add up: amount, qty, lines or invoices. Then pick a chart.
              </li>
              <li>Or just pick a quick chart. Click any bar or slice to see its lines in the table.</li>
            </ol>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              <li>
                Drag fields from the left into <b>Rows</b> (up to 2 - the second nests under the first with subtotals), <b>Columns</b> (splits into columns /
                chart series) or <b>Filters</b>. Drag a chip back to the list - or click its × - to remove it. Clicking a field adds it.
              </li>
              <li>
                <b>Filters</b>: drop any field there, then tick the values to keep (e.g. only some customers or months) - it only affects the studio.
              </li>
              <li>
                <b>Values</b>: up to 4 - the table shows them all, the chart uses the first (click &quot;chart it&quot; to swap). Scatter plots the first two
                against each other.
              </li>
              <li>Charts with many rows show the top N (largest first) - change it under Show / Sort. Months, quarters and years always run in date order.</li>
              <li>Save a layout as a view to come back to it; download the chart as PNG or the pivot table as CSV; open it full screen.</li>
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[210px_1fr]">
        {/* Field list - drag from here (or click to add); drop back here to remove. */}
        <div onDragOver={(e) => dragging?.from && e.preventDefault()} onDrop={drop(null)} className="space-y-3">
          {side && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Period &amp; filters</p>
              {side}
            </div>
          )}
          {cfg.mode === "advanced" && (
            <>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fields</p>
                <div className="flex flex-col items-stretch gap-1.5">
                  {fields.map((f) => (
                    <span
                      key={f.key}
                      {...dragProps({ kind: "field", key: f.key, from: null })}
                      onClick={() => addField(cfg.rows.length ? (cfg.col ? "rows" : "col") : "rows", f.key)}
                      title="Drag into Rows, Columns or Filters - or click to add"
                      className={fieldChip}
                    >
                      <GripVertical className="h-3 w-3 text-slate-300" />
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Values</p>
                <div className="flex flex-col items-stretch gap-1.5">
                  {MEASURES.map((m) => (
                    <span
                      key={m.key}
                      {...dragProps({ kind: "measure", key: m.key, from: null })}
                      onClick={() => addMeasure(m.key)}
                      title="Drag into Values - or click to add"
                      className={measureChip}
                    >
                      <Sigma className="h-3 w-3 opacity-60" />
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">Drag a field back here to remove it.</p>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {cfg.mode === "simple" ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["1", "Compare by", "What each bar / slice is"],
                    ["2", "Split by (optional)", "Colours each bar by a second field"],
                    ["3", "Measure", "What to add up"],
                  ] as const
                ).map(([n, label, hint]) => (
                  <label key={n} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">{n}</span>
                      {label}
                    </span>
                    {n === "1" ? (
                      <select
                        value={rowField ?? ""}
                        onChange={(e) => {
                          const k = e.target.value as PivotField;
                          update((c) => ({ ...c, rows: [k], col: c.col === k ? null : c.col }));
                        }}
                        className={`${select} w-full`}
                      >
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    ) : n === "2" ? (
                      <select
                        value={cfg.col ?? ""}
                        onChange={(e) => (e.target.value ? addField("col", e.target.value as PivotField) : removeField("col", ""))}
                        className={`${select} w-full`}
                      >
                        <option value="">Nothing</option>
                        {fields
                          .filter((f) => f.key !== rowField)
                          .map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <select value={m0} onChange={(e) => set({ values: [e.target.value as Measure] })} className={`${select} w-full`}>
                        {MEASURES.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
                  </label>
                ))}
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quick charts</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.filter((pr) => SIMPLE_CHARTS.includes(pr.cfg.chart as ChartType) && (pr.cfg.values?.length ?? 1) === 1).map((pr) => (
                    <button
                      key={pr.name}
                      type="button"
                      onClick={() => update((c) => ({ ...c, filters: [], ...pr.cfg }))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                    >
                      {pr.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {zone(
                "filters",
                "Filters",
                Filter,
                cfg.filters.map((f) =>
                  placed(
                    "filters",
                    f.field,
                    <FilterPicker
                      key={f.field}
                      all={distinctValues(rows, f.field)}
                      field={f.field}
                      include={f.include}
                      onChange={(include) => update((c) => ({ ...c, filters: c.filters.map((x) => (x.field === f.field ? { ...x, include } : x)) }))}
                    />,
                  ),
                ),
                "Drop a field to filter by its values",
              )}
              {zone("col", "Columns", Columns3, cfg.col ? [placed("col", cfg.col)] : [], "Drop a field to split into columns / series")}
              {zone(
                "rows",
                "Rows (up to 2)",
                Rows3,
                cfg.rows.map((r) => placed("rows", r)),
                "Drop a field to group by",
              )}
              {zone(
                "values",
                "Values (up to 4 - the chart uses the first)",
                Sigma,
                cfg.values.map((m, i) => (
                  <span
                    key={m}
                    {...dragProps({ kind: "measure", key: m, from: "values" })}
                    className={`${measureChip} ${i === 0 ? "ring-1 ring-emerald-400" : ""}`}
                  >
                    <GripVertical className="h-3 w-3 opacity-50" />
                    {measureInfo(m).label}
                    {i > 0 && (
                      <button
                        type="button"
                        title="Use this one in the chart"
                        onClick={() => set({ values: [m, ...cfg.values.filter((x) => x !== m)] })}
                        className="ml-0.5 text-[10px] underline"
                      >
                        chart it
                      </button>
                    )}
                    {cfg.values.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField("values", m)}
                        className="ml-0.5 text-emerald-500 hover:text-rose-600"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )),
                "Drop a value to total",
              )}
            </div>
          )}

          {/* Chart type gallery. */}
          <div className="flex flex-wrap gap-1.5">
            {CHARTS.filter((c) => cfg.mode === "advanced" || SIMPLE_CHARTS.includes(c.key)).map((c) => {
              const Icon = c.icon;
              const on = cfg.chart === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() =>
                    set({
                      chart: c.key,
                      ...(c.key === "scatter" && cfg.values.length < 2 ? { values: [cfg.values[0], cfg.values[0] === "qty" ? "amount" : "qty"] } : {}),
                    })
                  }
                  title={c.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${on ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Options. */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {!isTime(rowField) && (
              <label className="inline-flex items-center gap-1.5">
                Show
                <select value={cfg.top} onChange={(e) => set({ top: Number(e.target.value) })} className={select}>
                  {[5, 10, 20, 30, 50, 0].map((t) => (
                    <option key={t} value={t}>
                      {t ? `Top ${t}` : "All"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {cfg.mode === "advanced" && (
              <>
                <label className="inline-flex items-center gap-1.5">
                  Sort
                  <select value={cfg.sort} onChange={(e) => set({ sort: e.target.value as SortMode })} className={select}>
                    <option value="value-desc">Largest first</option>
                    <option value="value-asc">Smallest first</option>
                    <option value="label">A-Z</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  Size
                  <select value={cfg.size} onChange={(e) => set({ size: e.target.value as Config["size"] })} className={select}>
                    <option value="s">Small</option>
                    <option value="m">Medium</option>
                    <option value="l">Large</option>
                  </select>
                </label>
              </>
            )}
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={cfg.labels} onChange={(e) => set({ labels: e.target.checked })} className="rounded border-slate-300" />
              Data labels
            </label>
            <div className="ml-auto flex gap-2">
              {cfg.chart !== "heatmap" && (
                <button
                  type="button"
                  onClick={downloadPng}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ImageDown className="h-3.5 w-3.5" />
                  PNG
                </button>
              )}
              <button
                type="button"
                onClick={() => setFull(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Full screen
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mb-2 text-xs text-slate-400">
              {lines.length.toLocaleString()} line{lines.length === 1 ? "" : "s"}
              {cfg.filters.some((f) => f.include) ? " after the studio filters" : ""}
              {!isTime(rowField) && cfg.top && pivot.rowList.length > cfg.top ? ` · top ${cfg.top} of ${pivot.rowList.length}` : ""}
              {rowField && rowField !== "quarter" ? " · click a bar, slice or row to filter the table below" : ""}
            </p>
            {full ? (
              <div className="fixed inset-0 z-50 overflow-auto bg-white p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  <button
                    type="button"
                    onClick={() => setFull(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Minimize2 className="h-4 w-4" />
                    Close
                  </button>
                </div>
                {chartBox}
              </div>
            ) : (
              chartBox
            )}
          </div>

          {/* Pivot table. */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Pivot table</h3>
              <ExportCsvButton filename="sales-register-pivot.csv" headers={csvHeaders} rows={csvRows} />
            </div>
            <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th rowSpan={cfg.col && cfg.values.length > 1 ? 2 : 1} className="px-2 py-1.5 text-left font-medium">
                      {rowField ? fieldLabel(rowField) : "All"}
                      {row2 ? ` / ${fieldLabel(row2)}` : ""}
                    </th>
                    {cols.map((c) => (
                      <th key={c} colSpan={cfg.values.length} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        {labelOf(cfg.col, c)}
                        {cfg.values.length === 1 ? "" : ""}
                      </th>
                    ))}
                    {cfg.col ? (
                      <th colSpan={cfg.values.length} className="px-2 py-1.5 text-right font-medium">
                        Total
                      </th>
                    ) : (
                      cfg.values.map((m) => (
                        <th key={m} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                          {measureInfo(m).label}
                        </th>
                      ))
                    )}
                    {additive(m0) && (
                      <th rowSpan={cfg.col && cfg.values.length > 1 ? 2 : 1} className="px-2 py-1.5 text-right font-medium">
                        Share
                      </th>
                    )}
                  </tr>
                  {cfg.col && cfg.values.length > 1 && (
                    <tr className="border-b border-slate-200">
                      {[...cols, "__total"].flatMap((c) =>
                        cfg.values.map((m) => (
                          <th key={`${c}-${m}`} className="px-2 py-1 text-right font-medium normal-case whitespace-nowrap">
                            {measureInfo(m).short}
                          </th>
                        )),
                      )}
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pivot.rowList.map((g) => (
                    <Fragment key={g.key}>
                      <tr className={`hover:bg-slate-50 ${row2 ? "bg-slate-50/60 font-semibold" : ""}`}>
                        <td className="px-2 py-1">
                          <button type="button" onClick={() => pickRow(g.key)} className="text-left text-slate-800 hover:text-indigo-600">
                            {labelOf(rowField, g.key)}
                          </button>
                        </td>
                        {cols.flatMap((c) =>
                          cfg.values.map((m) => (
                            <td key={`${c}-${m}`} className="px-2 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
                              {g.cells.get(c) ? fmt(m, valueOf(g.cells.get(c), m)) : ""}
                            </td>
                          )),
                        )}
                        {cfg.values.map((m) => (
                          <td key={m} className="px-2 py-1 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                            {fmt(m, valueOf(g.total, m))}
                          </td>
                        ))}
                        {additive(m0) && <td className="px-2 py-1 text-right tabular-nums text-slate-500">{share(valueOf(g.total, m0))}</td>}
                      </tr>
                      {g.subs.map((s) => (
                        <tr key={s.key} className="hover:bg-slate-50">
                          <td className="py-1 pl-6 pr-2 text-slate-600">{labelOf(row2, s.key)}</td>
                          {cols.flatMap((c) =>
                            cfg.values.map((m) => (
                              <td key={`${c}-${m}`} className="px-2 py-1 text-right tabular-nums text-slate-600 whitespace-nowrap">
                                {s.cells.get(c) ? fmt(m, valueOf(s.cells.get(c), m)) : ""}
                              </td>
                            )),
                          )}
                          {cfg.values.map((m) => (
                            <td key={m} className="px-2 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
                              {fmt(m, valueOf(s.total, m))}
                            </td>
                          ))}
                          {additive(m0) && <td className="px-2 py-1 text-right tabular-nums text-slate-400">{share(valueOf(s.total, m0))}</td>}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-50">
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                    <td className="px-2 py-1.5">Grand total</td>
                    {cols.flatMap((c) =>
                      cfg.values.map((m) => (
                        <td key={`${c}-${m}`} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {fmt(m, valueOf(pivot.colTotals.get(c), m))}
                        </td>
                      )),
                    )}
                    {cfg.values.map((m) => (
                      <td key={m} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {fmt(m, valueOf(pivot.grand, m))}
                      </td>
                    ))}
                    {additive(m0) && <td className="px-2 py-1.5 text-right tabular-nums">100%</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            {cfg.col && pivot.colList.length > cols.length && (
              <p className="mt-1 text-[11px] text-slate-400">
                Showing the first {cols.length} of {pivot.colList.length} columns - the CSV has the same.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A filter field's value list: tick the values to keep.
function FilterPicker({
  all,
  field,
  include,
  onChange,
}: {
  all: string[];
  field: PivotField;
  include: string[] | null;
  onChange: (include: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const chosen = new Set(include ?? all);
  const list = q ? all.filter((v) => labelOf(field, v).toLowerCase().includes(q.toLowerCase())) : all;
  const toggle = (v: string) => {
    const next = new Set(chosen);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next.size === all.length ? null : [...next]);
  };
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 rounded bg-white px-1 text-[10px] text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
      >
        {include ? `${include.length} of ${all.length}` : "All"} ▾
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <span className="absolute left-0 top-full z-40 mt-1 flex w-64 cursor-default flex-col rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-700 shadow-lg">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="mb-1.5 rounded border border-slate-200 px-2 py-1 text-xs"
              autoFocus
            />
            <span className="mb-1 flex gap-3">
              <button type="button" onClick={() => onChange(null)} className="text-indigo-600 hover:underline">
                Select all
              </button>
              <button type="button" onClick={() => onChange([])} className="text-indigo-600 hover:underline">
                Clear
              </button>
              {include && (
                <button type="button" onClick={() => onChange(null)} className="ml-auto inline-flex items-center gap-0.5 text-rose-600 hover:underline">
                  <Trash2 className="h-3 w-3" />
                  Remove filter
                </button>
              )}
            </span>
            <span className="max-h-56 overflow-auto">
              {list.map((v) => (
                <label key={v} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                  <input type="checkbox" checked={chosen.has(v)} onChange={() => toggle(v)} className="rounded border-slate-300" />
                  <span className="truncate">{labelOf(field, v)}</span>
                </label>
              ))}
              {list.length === 0 && <span className="block px-1 py-2 text-slate-400">No matches</span>}
            </span>
          </span>
        </>
      )}
    </span>
  );
}
