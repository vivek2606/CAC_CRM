"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent, type ReactNode } from "react";
import {
  BarChart3,
  BarChartHorizontal,
  Box,
  CalendarRange,
  ChartArea,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartPie,
  ChartScatter,
  Columns3,
  Database,
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
  Table2,
  Target as TargetIcon,
  Trash2,
  X,
} from "lucide-react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { formatCurrency } from "@/lib/format";
import { PivotChart } from "./chart";
import {
  applyFilters,
  applyPeriod,
  buildPivot,
  dimsOf,
  distinctValues,
  filterTargets,
  isTime,
  keyOf,
  labelOf,
  periodRange,
  perYear,
  shiftKey,
  sanitize,
  targetsInPeriod,
  type Acc,
  type ChartType,
  type Dataset,
  type MeasureDef,
  type PeriodPreset,
  type SortMode,
  type StudioConfig,
} from "./engine";

// Chart studio: pick a source, drag its fields into Filters / Rows / Columns
// / Values (or click them), pick a chart (or just the table) and read the
// pivot table under it. Simple mode keeps it to three choices; Advanced has
// everything. Clicking a row (bar, slice, cell) calls onPick.

export type StudioView = { id: string; name: string; cfg: StudioConfig };

const BASE: Omit<StudioConfig, "dataset" | "rows" | "values"> = {
  col: null,
  filters: [],
  chart: "bar",
  top: 20,
  labels: true,
  sort: "value-desc",
  size: "m",
  mode: "simple",
};
export function defaultConfig(ds: Dataset): StudioConfig {
  return {
    ...BASE,
    dataset: ds.key,
    rows: [dimsOf(ds)[0].key],
    values: [ds.measures[0].key],
    ...(ds.periodField ? { period: { field: ds.periodField, preset: "last6m" as PeriodPreset } } : {}),
    ...ds.defaultCfg,
  };
}

const SIMPLE_CHARTS: ChartType[] = ["bar", "column", "line", "donut", "treemap", "target", "table"];
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
  { key: "target", label: "Target vs achieved", icon: TargetIcon },
  { key: "table", label: "Table only", icon: Table2 },
];
const PERIODS: { key: PeriodPreset; label: string }[] = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisQuarter", label: "This quarter" },
  { key: "lastQuarter", label: "Last quarter" },
  { key: "last3m", label: "Last 3 months" },
  { key: "last6m", label: "Last 6 months" },
  { key: "last12m", label: "Last 12 months" },
  { key: "thisYear", label: "This year" },
  { key: "lastYear", label: "Last year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom dates" },
];
const HEIGHTS = { s: 260, m: 360, l: 520 };

type Zone = "filters" | "rows" | "col" | "values";
type Drag = { kind: "field" | "measure"; key: string; from: Zone | null };
const MIME = "application/x-cac-pivot";

const load = <T,>(key: string): T | null => {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const store = (key: string, v: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};

export function ChartStudio({
  datasets,
  initial,
  storageKey,
  side,
  periodControl = false,
  onPick,
  onChange,
  header,
  views,
}: {
  datasets: Dataset[];
  // A saved tab / view to open (else the last layout, or the default).
  initial?: StudioConfig | null;
  // Remember the last layout in this browser.
  storageKey?: string;
  // Extra panel at the top of the side panel (e.g. the page's filters).
  side?: ReactNode;
  // A Period control (date field + range) - for sources loaded whole.
  periodControl?: boolean;
  onPick?: (dim: string, key: string) => void;
  onChange?: (cfg: StudioConfig) => void;
  // Extra buttons in the header (e.g. Save tab).
  header?: (cfg: StudioConfig) => ReactNode;
  // Saved views ("My views").
  views?: { list: StudioView[]; save: (name: string, cfg: StudioConfig) => Promise<void>; remove: (id: string) => Promise<void> };
}) {
  const dsOf = (key: string | undefined) => datasets.find((d) => d.key === key) ?? datasets[0];
  const [cfg, setCfg] = useState<StudioConfig>(() =>
    initial ? sanitize(initial, dsOf(initial.dataset), defaultConfig(dsOf(initial.dataset))) : defaultConfig(datasets[0]),
  );
  const [full, setFull] = useState(false);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState<Drag | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  // No saved tab: the last layout used comes back (this browser only).
  useEffect(() => {
    if (initial || !storageKey) return;
    const saved = load<Partial<StudioConfig>>(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount (localStorage isn't there on the server)
    if (saved) setCfg(sanitize(saved, dsOf(saved.dataset), defaultConfig(dsOf(saved.dataset))));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A change by the user: remembered here, and the host told after the
  // render (not during it).
  const [changes, setChanges] = useState(0);
  const update = (f: (c: StudioConfig) => StudioConfig) => {
    setCfg((c) => {
      const next = f(c);
      if (storageKey) store(storageKey, next);
      return next;
    });
    setChanges((n) => n + 1);
  };
  useEffect(() => {
    if (changes) onChange?.(cfg);
  }, [changes]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<StudioConfig>) => update((c) => ({ ...c, ...patch }));

  const ds = dsOf(cfg.dataset);
  const dims = useMemo(() => dimsOf(ds), [ds]);
  const dimLabel = (k: string | null | undefined) => dims.find((d) => d.key === k)?.label ?? (k === null ? "All" : "");
  const measures = ds.measures.filter((m) => !m.target || ds.targets);
  const mOf = (k: string) => ds.measures.find((m) => m.key === k) ?? ds.measures[0];
  const switchDataset = (key: string) => update((c) => ({ ...defaultConfig(dsOf(key)), mode: c.mode }));

  // Moving fields between the zones.
  const addField = (zone: Zone, key: string) =>
    update((c) => {
      if (zone === "filters") return c.filters.some((f) => f.field === key) ? c : { ...c, filters: [...c.filters, { field: key, include: null }] };
      let r = c.rows.filter((x) => x !== key);
      let col = c.col === key ? null : c.col;
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
  const addMeasure = (key: string) => update((c) => (c.values.includes(key) ? c : { ...c, values: [...c.values, key].slice(-4) }));
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
      // Simple: the dropped value becomes the Measure.
      if (zone !== "values") return;
      if (cfg.mode === "simple") set({ values: [d.key, ...cfg.values.filter((v) => v !== d.key)] });
      else addMeasure(d.key);
      return;
    }
    if (zone === "values") return;
    // Simple: the dropped field becomes Compare by / Split by.
    if (cfg.mode === "simple") {
      if (zone === "rows") update((c) => ({ ...c, rows: [d.key], col: c.col === d.key ? null : c.col }));
      if (zone === "col" && d.key !== cfg.rows[0]) set({ col: d.key });
      return;
    }
    if (d.from && d.from !== zone && d.from !== "filters") removeField(d.from, d.key);
    addField(zone, d.key);
  };
  const accepts = (zone: Zone | null) => !dragging || zone === null || (dragging.kind === "measure" ? zone === "values" : zone !== "values");
  const dragProps = (d: Drag) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify(d));
      e.dataTransfer.effectAllowed = "move";
      setTimeout(() => setDragging(d), 0);
    },
    onDragEnd: () => setDragging(null),
  });

  // The records: the period (when the studio has one), then its filters.
  const inPeriod = useMemo(() => (periodControl ? applyPeriod(ds.rows, cfg.period) : ds.rows), [ds, cfg.period, periodControl]);
  const recs = useMemo(() => applyFilters(inPeriod, cfg.filters), [inPeriod, cfg.filters]);
  const picked = cfg.values.map(mOf);
  const usesTarget = cfg.chart === "target" || picked.some((m) => m.target);
  const monthTargetDim = ds.targetDims?.find((d) => d.endsWith(":month"));
  const pivotTargets =
    usesTarget && ds.targets
      ? filterTargets(periodControl ? targetsInPeriod(ds.targets, cfg.period, monthTargetDim) : ds.targets, cfg.filters, ds.targetDims ?? [])
      : [];
  const pivot = buildPivot(recs, { rows: cfg.rows, col: cfg.col, values: cfg.values, sort: cfg.sort }, ds, pivotTargets);
  const rowField = cfg.rows[0] ?? null;
  const row2 = cfg.rows[1] ?? null;
  const canPick = !!onPick && !!rowField;
  const pickRow = (k: string) => {
    if (canPick && rowField) onPick!(rowField, k);
  };
  const m0 = picked[0];
  const actual = ds.actualMeasure ? mOf(ds.actualMeasure) : undefined;
  const title = `${m0.label} by ${rowField ? dimLabel(rowField).toLowerCase() : "all"}${cfg.col ? ` and ${dimLabel(cfg.col).toLowerCase()}` : ""}`;
  const targetNote = `Targets are set per ${
    (ds.targetDims ?? [])
      .filter((d) => !d.includes(":"))
      .map((d) => dimLabel(d).toLowerCase())
      .join(" / ") || "period"
  } per month - group by those or by month / quarter / year to see them.`;

  const downloadPng = () => {
    // The chart's own drawing (the largest SVG - legend icons are SVGs too),
    // with the title and the legend (HTML) drawn in.
    const svgs = [...(chartRef.current?.querySelectorAll("svg.recharts-surface") ?? [])] as SVGSVGElement[];
    const area = (el: SVGSVGElement) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
    const svg = svgs.sort((a, b) => area(b) - area(a))[0];
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const legend = [...(chartRef.current?.querySelectorAll(".recharts-legend-item") ?? [])].map((li) => ({
      text: li.textContent ?? "",
      color: li.querySelector("path, rect")?.getAttribute("fill") ?? li.querySelector("path")?.getAttribute("stroke") ?? "#94a3b8",
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
  const saveView = async () => {
    if (!views) return;
    const name = window.prompt("Name this view", title)?.trim();
    if (name) await views.save(name, cfg);
  };

  const select = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs";
  const chip = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium cursor-grab active:cursor-grabbing select-none";
  const fieldChip = `${chip} border-slate-200 bg-white text-slate-700 hover:border-indigo-300`;
  const measureChip = `${chip} border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400`;
  const height = full ? Math.max(400, (typeof window !== "undefined" ? window.innerHeight : 800) - 220) : HEIGHTS[cfg.size];
  const presets = ds.presets.filter((p) => (!p.cfg.values?.some((v) => mOf(v).target) && p.cfg.chart !== "target") || ds.targets);
  // A quick chart: from the source's defaults (keeping the mode and
  // period), then its own settings.
  const applyCfg = (pc: Partial<StudioConfig>) => update((c) => sanitize({ ...defaultConfig(ds), mode: c.mode, period: c.period, ...pc }, ds, defaultConfig(ds)));
  const applyPreset = (name: string) => {
    const p = presets.find((x) => x.name === name);
    if (p) applyCfg(p.cfg);
  };

  // Advanced: quick charts suited to the chart type picked - its ready-made
  // ones, then ones made from this source's fields (a donut gets fields with
  // a few values, a line the months / quarters, a heatmap field x month...).
  const sig = (c: Partial<StudioConfig>) => JSON.stringify([c.rows ?? [], c.col ?? null, c.values ?? []]);
  const suggestions = (() => {
    if (cfg.mode !== "advanced") return [];
    const type = cfg.chart;
    const sizes = new Map(dims.filter((d) => !d.grain).map((d) => [d.key, new Set(inPeriod.map((r) => keyOf(r, d.key))).size]));
    const cats = dims.filter((d) => !d.grain && (sizes.get(d.key) ?? 0) >= 2);
    const small = cats.filter((d) => (sizes.get(d.key) ?? 0) <= 10);
    const medium = cats.filter((d) => (sizes.get(d.key) ?? 0) <= 40);
    const large = [...cats].sort((a, b) => (sizes.get(b.key) ?? 0) - (sizes.get(a.key) ?? 0));
    const ordered = cats.filter((d) => ds.fields.find((f) => f.key === d.key)?.order);
    const dateField = cfg.period?.field ?? ds.periodField ?? ds.fields.find((f) => f.date)?.key;
    const month = dateField ? `${dateField}:month` : null;
    const quarter = dateField ? `${dateField}:quarter` : null;
    const year = dateField ? `${dateField}:year` : null;
    const plain = measures.filter((m) => !m.target);
    const m1 = plain[0];
    const m2 = plain.find((m) => m.key !== m1.key && m.additive) ?? plain[1];
    const out: { name: string; cfg: Partial<StudioConfig> }[] = [];
    const add = (rows: (string | null | undefined)[], col: string | null | undefined, values: MeasureDef[], extra: Partial<StudioConfig> = {}) => {
      const r = rows.filter((x): x is string => !!x);
      if (!r.length || values.some((v) => !v)) return;
      const name = `${type === "scatter" && values[1] ? `${values[0].short} vs ${values[1].short.toLowerCase()}` : values[0].short} by ${dimLabel(r[0]).toLowerCase()}${r[1] ? ` then ${dimLabel(r[1]).toLowerCase()}` : ""}${col ? ` × ${dimLabel(col).toLowerCase()}` : ""}`;
      out.push({ name, cfg: { rows: r, col: col ?? null, values: values.map((v) => v.key), chart: type, ...extra } });
    };
    switch (type) {
      case "bar":
        medium.slice(0, 4).forEach((d) => add([d.key], null, [m1], { top: 20 }));
        if (small[0] && medium[1]) add([medium[1].key], small[0].key === medium[1].key ? small[1]?.key : small[0].key, [m1]);
        break;
      case "column":
      case "percent":
        small.slice(0, 3).forEach((d) => add([month], d.key, [m1]));
        if (small[0]) add([quarter], small[0].key, [m1]);
        break;
      case "clustered":
        medium.slice(0, 2).forEach((d) => add([d.key], year, [m1], { top: 10 }));
        small.slice(0, 2).forEach((d) => add([quarter], d.key, [m1]));
        break;
      case "column3d":
        small.slice(0, 4).forEach((d) => add([d.key], null, [m1]));
        break;
      case "line":
        add([month], null, [m1]);
        add([quarter], null, [m1]);
        small.slice(0, 2).forEach((d) => add([month], d.key, [m1]));
        if (m2) add([month], null, [m2]);
        break;
      case "area":
        add([month], null, [m1]);
        small.slice(0, 3).forEach((d) => add([month], d.key, [m1]));
        break;
      case "donut":
      case "pie":
        small.slice(0, 5).forEach((d) => add([d.key], null, [m1]));
        break;
      case "treemap":
        large.slice(0, 4).forEach((d) => add([d.key], null, [m1], { top: 30 }));
        break;
      case "funnel":
        [...ordered, ...small.filter((d) => !ordered.includes(d))].slice(0, 4).forEach((d) => add([d.key], null, [m1]));
        break;
      case "radar":
        small.filter((d) => (sizes.get(d.key) ?? 0) >= 3).slice(0, 2).forEach((d) => {
          const other = small.find((x) => x.key !== d.key);
          add([d.key], other?.key, [m1]);
          add([d.key], null, [m1]);
        });
        break;
      case "heatmap":
        medium.slice(0, 3).forEach((d) => add([d.key], month, [m1]));
        if (small[0]) add([small[0].key], quarter, [m1]);
        break;
      case "scatter":
        if (m2) medium.slice(0, 4).forEach((d) => add([d.key], null, [m1, m2], { top: 50 }));
        break;
      case "target": {
        const td = ds.targetDims ?? [];
        const actualM = ds.actualMeasure ? mOf(ds.actualMeasure) : undefined;
        const tVals = actualM ? [actualM, ...measures.filter((m) => m.target)] : [];
        td.filter((d) => d.endsWith(":month") || d.endsWith(":quarter") || !d.includes(":")).forEach((d) => add([d], null, tVals, { top: 0 }));
        break;
      }
      case "table":
        small.slice(0, 2).forEach((d) => add([d.key, quarter], null, plain.slice(0, 3)));
        add([quarter], null, plain.slice(0, 3));
        medium.slice(0, 2).forEach((d) => add([d.key], year, [m1]));
        break;
    }
    const seen = new Set<string>();
    return [...presets.filter((p) => p.cfg.chart === type), ...out]
      .filter((p) => {
        const k = sig(p.cfg);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8);
  })();

  const zone = (z: Zone, label: string, icon: ComponentType<{ className?: string }>, children: ReactNode[], hint: string) => {
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
        {children.length === 0 && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
    );
  };
  const placed = (z: Zone, key: string, extra?: ReactNode) => (
    <span key={key} {...dragProps({ kind: "field", key, from: z })} className={`${fieldChip} border-indigo-200 bg-indigo-50 text-indigo-800`}>
      <GripVertical className="h-3 w-3 opacity-50" />
      {dimLabel(key)}
      {extra}
      <button type="button" onClick={() => removeField(z, key)} className="ml-0.5 text-indigo-400 hover:text-rose-600" aria-label={`Remove ${dimLabel(key)}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );

  // ---- The pivot table (all the Values; Columns across). ----
  const cols = cfg.col ? pivot.colList.slice(0, 60) : [];
  const fmt = (m: MeasureDef, a: Acc | undefined) => {
    if (m.target && !pivot.targetOk) return "—";
    if (!a) return "";
    const n = m.value(a);
    if (m.pct) return n ? `${n.toFixed(1)}%` : "—";
    return m.money ? formatCurrency(n) : n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
  };
  const share = (a: Acc) => {
    const g = m0.value(pivot.grand);
    return g ? `${((m0.value(a) / g) * 100).toFixed(1)}%` : "—";
  };
  // Rows by month / quarter / year: the first value's change vs the period
  // before and vs the same period a year before (when those are in the data).
  const growth = isTime(rowField) && !m0.target ? { prev: 1, year: perYear(rowField) } : null;
  const byKey = new Map(pivot.rowList.map((g) => [g.key, m0.value(g.total)]));
  const change = (k: string, back: number): number | null => {
    const pk = shiftKey(rowField, k, back);
    const prev = pk != null ? byKey.get(pk) : undefined;
    const cur = byKey.get(k);
    return prev && cur != null ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  };
  const growthLabel = { month: ["vs previous month", "vs same month last year"], quarter: ["vs previous quarter", "vs same quarter last year"], year: ["vs previous year", ""] }[
    (rowField?.split(":")[1] as "month" | "quarter" | "year") ?? "year"
  ] ?? ["", ""];
  const growthCell = (k: string, back: number) => {
    const c = change(k, back);
    if (c == null) return <span className="text-slate-300">—</span>;
    return <span className={c >= 0 ? "text-emerald-700" : "text-rose-700"}>{`${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}%`}</span>;
  };
  const showYoY = growth && growth.year > 1;
  const csvHeaders = [
    rowField ? dimLabel(rowField) : "",
    ...(row2 ? [dimLabel(row2)] : []),
    ...cols.flatMap((c) => picked.map((m) => `${labelOf(cfg.col, c)} - ${m.short}`)),
    ...picked.map((m) => `Total - ${m.short}`),
    ...(growth ? [`${m0.short} ${growthLabel[0]} %`, ...(showYoY ? [`${m0.short} ${growthLabel[1]} %`] : [])] : []),
  ];
  const pctOrBlank = (x: number | null) => (x == null ? "" : Math.round(x * 10) / 10);
  const num = (m: MeasureDef, a: Acc | undefined) => (a ? Math.round(m.value(a) * 100) / 100 : 0);
  const csvRows: (string | number)[][] = [];
  for (const g of pivot.rowList) {
    csvRows.push([
      labelOf(rowField, g.key),
      ...(row2 ? [""] : []),
      ...cols.flatMap((c) => picked.map((m) => num(m, g.cells.get(c)))),
      ...picked.map((m) => num(m, g.total)),
      ...(growth ? [pctOrBlank(change(g.key, 1)), ...(showYoY ? [pctOrBlank(change(g.key, growth.year))] : [])] : []),
    ]);
    for (const s of g.subs)
      csvRows.push([
        labelOf(rowField, g.key),
        labelOf(row2, s.key),
        ...cols.flatMap((c) => picked.map((m) => num(m, s.cells.get(c)))),
        ...picked.map((m) => num(m, s.total)),
      ]);
  }
  csvRows.push([
    "Grand total",
    ...(row2 ? [""] : []),
    ...cols.flatMap((c) => picked.map((m) => num(m, pivot.colTotals.get(c)))),
    ...picked.map((m) => num(m, pivot.grand)),
  ]);

  const chartBox =
    cfg.chart === "table" ? null : (
      <div ref={chartRef}>
        <PivotChart
          pivot={pivot}
          rowField={rowField}
          colField={cfg.col}
          measures={picked}
          actual={actual}
          targetNote={targetNote}
          type={cfg.chart}
          top={cfg.top}
          labels={cfg.labels}
          height={height}
          onPick={pickRow}
        />
      </div>
    );
  const range = periodRange(cfg.period);
  const dateFields = ds.fields.filter((f) => f.date);

  // Simple mode's three steps take a dropped field / value too.
  const stepDrop = (z: Zone) => ({ onDragOver: (e: DragEvent) => accepts(z) && e.preventDefault(), onDrop: drop(z) });
  const stepTone = (z: Zone) =>
    dragging ? (accepts(z) ? "border-2 border-dashed border-indigo-300 bg-indigo-50/50" : "border-slate-200 opacity-50") : "border-slate-200 bg-slate-50/50";

  // While dragging: the drop boxes pinned to the top of the screen, so a
  // field can be dropped wherever the page is scrolled to.
  const dropBar = dragging && (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 pointer-events-none">
      <div
        className={`pointer-events-auto grid w-full max-w-3xl gap-2 rounded-xl border border-indigo-200 bg-white/95 p-2 shadow-xl backdrop-blur ${cfg.mode === "simple" ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}
      >
        {(cfg.mode === "simple"
          ? ([
              ["rows", "1 · Compare by", Rows3],
              ["col", "2 · Split by", Columns3],
              ["values", "3 · Measure", Sigma],
            ] as const)
          : ([
              ["filters", "Filters", Filter],
              ["rows", "Rows", Rows3],
              ["col", "Columns", Columns3],
              ["values", "Values", Sigma],
            ] as const)
        ).map(([z, label, Icon]) => {
          const ok = accepts(z);
          return (
            <div
              key={z}
              onDragOver={(e) => ok && e.preventDefault()}
              onDrop={drop(z)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-3 text-xs font-semibold ${ok ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-100 text-slate-300"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.mode === "simple" ? label : `Drop in ${label}`}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {dropBar}
      {/* Header: mode, help, quick charts, views, the host's buttons. */}
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
          <select value="" onChange={(e) => applyPreset(e.target.value)} className={select}>
            <option value="">Quick charts…</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {views && (
          <>
            <select
              value=""
              onChange={(e) => {
                const v = views.list.find((x) => x.id === e.target.value);
                if (v) update(() => sanitize(v.cfg, dsOf(v.cfg.dataset), defaultConfig(dsOf(v.cfg.dataset))));
              }}
              className={select}
              disabled={!views.list.length}
            >
              <option value="">{views.list.length ? `My views (${views.list.length})…` : "No saved views"}</option>
              {views.list.map((v) => (
                <option key={v.id} value={v.id}>
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
            {views.list.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const v = views.list.find((x) => x.id === e.target.value);
                  if (v && window.confirm(`Delete the view "${v.name}"?`)) void views.remove(v.id);
                }}
                className={`${select} text-rose-600`}
              >
                <option value="">Delete a view…</option>
                {views.list.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {header?.(cfg)}
        <button type="button" onClick={() => update((c) => ({ ...defaultConfig(ds), mode: c.mode }))} className="text-xs text-slate-500 hover:text-slate-800">
          Reset
        </button>
      </div>

      {help && (
        <div className="border-b border-slate-100 bg-indigo-50/40 px-4 py-3 text-xs text-slate-700">
          {cfg.mode === "simple" ? (
            <ol className="list-decimal space-y-1 pl-4">
              <li>{datasets.length > 1 ? "Pick the source (deals, leads…) and the period on the left." : "Set the period and filters on the left."}</li>
              <li>
                <b>Compare by</b> - what each bar is (stage, sales person, month…). <b>Split by</b> (optional) colours each bar by a second field.
              </li>
              <li>
                <b>Measure</b> - what to count or add up. Then pick a chart - or Table only.
              </li>
              <li>Or just pick a quick chart.{onPick ? " Click any bar or slice to see its lines in the table below." : ""}</li>
            </ol>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              <li>
                Drag fields from the left into <b>Rows</b> (up to 2 - the second nests under the first with subtotals), <b>Columns</b> (splits into columns /
                chart series) or <b>Filters</b>. Drag a chip back to the list - or click its × - to remove it. Clicking a field adds it.
              </li>
              <li>
                <b>Filters</b>: drop any field there, then tick the values to keep (e.g. some sales persons, stages or months).
              </li>
              <li>
                <b>Values</b>: up to 4 - the table shows them all, the chart uses the first (click &quot;chart it&quot; to swap). Scatter plots the first two
                against each other.
              </li>
              <li>Charts with many rows show the top N (largest first) - change it under Show / Sort. Months, quarters and years run in date order.</li>
              <li>Download the chart as PNG or the table as CSV; open it full screen.</li>
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[210px_1fr]">
        {/* Side panel: source, period, the host's filters, the fields. */}
        <div
          onDragOver={(e) => dragging?.from && e.preventDefault()}
          onDrop={drop(null)}
          className="space-y-3 md:sticky md:top-2 md:max-h-[calc(100vh-1rem)] md:self-start md:overflow-y-auto md:pr-1"
        >
          {datasets.length > 1 && (
            <label className="block rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <Database className="h-3 w-3" />
                Source
              </span>
              <select value={ds.key} onChange={(e) => switchDataset(e.target.value)} className={`${select} w-full text-sm`}>
                {datasets.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {periodControl && dateFields.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <CalendarRange className="h-3 w-3" />
                Period
              </span>
              <select
                value={cfg.period?.field ?? dateFields[0].key}
                onChange={(e) => set({ period: { preset: "last6m", ...cfg.period, field: e.target.value } })}
                className={`${select} w-full`}
                title="Which date the period is on"
              >
                {dateFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    By {f.label.toLowerCase()}
                  </option>
                ))}
              </select>
              <select
                value={cfg.period?.preset ?? "all"}
                onChange={(e) => set({ period: { field: cfg.period?.field ?? dateFields[0].key, ...cfg.period, preset: e.target.value as PeriodPreset } })}
                className={`${select} w-full`}
              >
                {PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              {cfg.period?.preset === "custom" && (
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-500">
                    From date
                    <input
                      type="date"
                      value={cfg.period.from ?? ""}
                      onChange={(e) => set({ period: { ...cfg.period!, from: e.target.value } })}
                      className={`${select} w-full`}
                    />
                  </label>
                  <label className="block text-[11px] text-slate-500">
                    To date
                    <input
                      type="date"
                      value={cfg.period.to ?? ""}
                      onChange={(e) => set({ period: { ...cfg.period!, to: e.target.value } })}
                      className={`${select} w-full`}
                    />
                  </label>
                </div>
              )}
              {range && cfg.period?.preset !== "custom" && (
                <p className="text-[11px] text-slate-400">
                  {range.from.split("-").reverse().join("/")} - {range.to.split("-").reverse().join("/")}
                </p>
              )}
            </div>
          )}
          {side && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Period &amp; filters</p>
              {side}
            </div>
          )}
          <>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fields</p>
              {cfg.mode === "simple" && <p className="mb-1.5 text-[11px] text-slate-400">Drag onto 1 Compare by or 2 Split by - or click to compare by it.</p>}
              <div className="flex flex-col items-stretch gap-1.5">
                {dims.map((f) => (
                  <span
                    key={f.key}
                    {...dragProps({ kind: "field", key: f.key, from: null })}
                    onClick={() =>
                      cfg.mode === "simple"
                        ? update((c) => ({ ...c, rows: [f.key], col: c.col === f.key ? null : c.col }))
                        : addField(cfg.rows.length ? (cfg.col ? "rows" : "col") : "rows", f.key)
                    }
                    title={
                      cfg.mode === "simple"
                        ? "Drag onto Compare by or Split by - or click to compare by it"
                        : "Drag into Rows, Columns or Filters - or click to add"
                    }
                    className={`${fieldChip} ${f.grain && f.grain !== "month" ? "ml-3" : ""}`}
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
                {measures.map((m) => (
                  <span
                    key={m.key}
                    {...dragProps({ kind: "measure", key: m.key, from: null })}
                    onClick={() => (cfg.mode === "simple" ? set({ values: [m.key, ...cfg.values.filter((v) => v !== m.key)] }) : addMeasure(m.key))}
                    title={cfg.mode === "simple" ? "Drag onto Measure - or click to use it" : "Drag into Values - or click to add"}
                    className={measureChip}
                  >
                    <Sigma className="h-3 w-3 opacity-60" />
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
            {cfg.mode === "advanced" && <p className="text-[11px] text-slate-400">Drag a field back here to remove it.</p>}
          </>
        </div>

        <div className="min-w-0 space-y-3">
          {cfg.mode === "simple" ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label {...stepDrop("rows")} className={`rounded-lg border p-2.5 ${stepTone("rows")}`}>
                  <Step n="1" label="Compare by" />
                  <select
                    value={rowField ?? ""}
                    onChange={(e) => {
                      const k = e.target.value;
                      update((c) => ({ ...c, rows: [k], col: c.col === k ? null : c.col }));
                    }}
                    className={`${select} w-full`}
                  >
                    {dims.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-400">What each bar / slice is</span>
                </label>
                <label {...stepDrop("col")} className={`rounded-lg border p-2.5 ${stepTone("col")}`}>
                  <Step n="2" label="Split by (optional)" />
                  <select
                    value={cfg.col ?? ""}
                    onChange={(e) => (e.target.value ? addField("col", e.target.value) : removeField("col", ""))}
                    className={`${select} w-full`}
                  >
                    <option value="">Nothing</option>
                    {dims
                      .filter((f) => f.key !== rowField)
                      .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-400">Colours each bar by a second field</span>
                </label>
                <label {...stepDrop("values")} className={`rounded-lg border p-2.5 ${stepTone("values")}`}>
                  <Step n="3" label="Measure" />
                  <select
                    value={m0.key}
                    onChange={(e) => set({ values: [e.target.value, ...cfg.values.slice(1).filter((v) => v !== e.target.value)] })}
                    className={`${select} w-full`}
                  >
                    {measures.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-400">What to count or add up</span>
                </label>
              </div>
              {presets.some((p) => p.simple !== false) && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quick charts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {presets
                      .filter((p) => p.simple !== false)
                      .map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => applyPreset(p.name)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
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
                      all={distinctValues(inPeriod, f.field)}
                      label={(k) => labelOf(f.field, k)}
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
                picked.map((m, i) => (
                  <span
                    key={m.key}
                    {...dragProps({ kind: "measure", key: m.key, from: "values" })}
                    className={`${measureChip} ${i === 0 ? "ring-1 ring-emerald-400" : ""}`}
                  >
                    <GripVertical className="h-3 w-3 opacity-50" />
                    {m.label}
                    {i > 0 && (
                      <button
                        type="button"
                        title="Use this one in the chart"
                        onClick={() => set({ values: [m.key, ...cfg.values.filter((x) => x !== m.key)] })}
                        className="ml-0.5 text-[10px] underline"
                      >
                        chart it
                      </button>
                    )}
                    {cfg.values.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField("values", m.key)}
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
            {CHARTS.filter((c) => (cfg.mode === "advanced" || SIMPLE_CHARTS.includes(c.key)) && (c.key !== "target" || ds.targets)).map((c) => {
              const Icon = c.icon;
              const on = cfg.chart === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() =>
                    update((cc) => {
                      const next: StudioConfig = { ...cc, chart: c.key };
                      if (c.key === "scatter" && cc.values.length < 2)
                        next.values = [cc.values[0], measures.find((m) => m.key !== cc.values[0] && !m.target)?.key ?? cc.values[0]];
                      if (c.key === "target") {
                        // Achieved and target, grouped by something targets are set by.
                        const td = ds.targetDims ?? [];
                        next.values = [ds.actualMeasure!, ...measures.filter((m) => m.target).map((m) => m.key)].slice(0, 4);
                        if (![cc.rows[0], cc.rows[1], cc.col].every((f) => !f || td.includes(f))) {
                          next.rows = [td.find((d) => d.endsWith(":month")) ?? td[0]];
                          next.col = null;
                        }
                      }
                      return next;
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

          {suggestions.length > 0 && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
              <p className="mb-1.5 text-[11px] font-semibold text-indigo-800">
                Suggested {CHARTS.find((c) => c.key === cfg.chart)?.label.toLowerCase()} charts for this data
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((sg) => {
                  const on = sig(sg.cfg) === sig(cfg);
                  return (
                    <button
                      key={`${sg.name}-${sig(sg.cfg)}`}
                      type="button"
                      onClick={() => applyCfg(sg.cfg)}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "border-indigo-500 bg-indigo-600 text-white" : "border-indigo-200 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700"}`}
                    >
                      {sg.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                {cfg.chart !== "table" && (
                  <label className="inline-flex items-center gap-1.5">
                    Size
                    <select value={cfg.size} onChange={(e) => set({ size: e.target.value as StudioConfig["size"] })} className={select}>
                      <option value="s">Small</option>
                      <option value="m">Medium</option>
                      <option value="l">Large</option>
                    </select>
                  </label>
                )}
              </>
            )}
            {cfg.chart !== "table" && (
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={cfg.labels} onChange={(e) => set({ labels: e.target.checked })} className="rounded border-slate-300" />
                Data labels
              </label>
            )}
            {cfg.chart !== "table" && (
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
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mb-2 text-xs text-slate-400">
              {recs.length.toLocaleString()} {ds.noun}
              {cfg.filters.some((f) => f.include) ? " after the filters" : ""}
              {cfg.chart !== "table" && !isTime(rowField) && cfg.top && pivot.rowList.length > cfg.top ? ` · top ${cfg.top} of ${pivot.rowList.length}` : ""}
              {canPick ? " · click a bar, slice or row to filter the table below" : ""}
            </p>
            {usesTarget && pivot.targetOk && (
              <p className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
                Achieved = won sales + project billing under the sales person&apos;s name. Targets are the monthly targets per sales person (whole months) - filters on other fields don&apos;t change them.
              </p>
            )}
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
              <h3 className="text-sm font-semibold text-slate-900">{cfg.chart === "table" ? title : "Pivot table"}</h3>
              <ExportCsvButton filename={`${title.replace(/[^A-Za-z0-9]+/g, "-")}.csv`} headers={csvHeaders} rows={csvRows} />
            </div>
            <div className={`${cfg.chart === "table" ? "max-h-[720px]" : "max-h-[520px]"} overflow-auto rounded-lg border border-slate-200`}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th rowSpan={cfg.col && picked.length > 1 ? 2 : 1} className="px-2 py-1.5 text-left font-medium">
                      {rowField ? dimLabel(rowField) : "All"}
                      {row2 ? ` / ${dimLabel(row2)}` : ""}
                    </th>
                    {cols.map((c) => (
                      <th key={c} colSpan={picked.length} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        {labelOf(cfg.col, c)}
                      </th>
                    ))}
                    {cfg.col ? (
                      <th colSpan={picked.length} className="px-2 py-1.5 text-right font-medium">
                        Total
                      </th>
                    ) : (
                      picked.map((m) => (
                        <th key={m.key} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                          {m.label}
                        </th>
                      ))
                    )}
                    {m0.additive && (
                      <th rowSpan={cfg.col && picked.length > 1 ? 2 : 1} className="px-2 py-1.5 text-right font-medium">
                        Share
                      </th>
                    )}
                    {growth && (
                      <th rowSpan={cfg.col && picked.length > 1 ? 2 : 1} className="px-2 py-1.5 text-right font-medium whitespace-nowrap" title={`${m0.label}, change ${growthLabel[0]}`}>
                        {m0.short} {growthLabel[0]}
                      </th>
                    )}
                    {showYoY && (
                      <th rowSpan={cfg.col && picked.length > 1 ? 2 : 1} className="px-2 py-1.5 text-right font-medium whitespace-nowrap" title={`${m0.label}, change ${growthLabel[1]}`}>
                        {m0.short} {growthLabel[1]}
                      </th>
                    )}
                  </tr>
                  {cfg.col && picked.length > 1 && (
                    <tr className="border-b border-slate-200">
                      {[...cols, "__total"].flatMap((c) =>
                        picked.map((m) => (
                          <th key={`${c}-${m.key}`} className="px-2 py-1 text-right font-medium normal-case whitespace-nowrap">
                            {m.short}
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
                          {canPick ? (
                            <button type="button" onClick={() => pickRow(g.key)} className="text-left text-slate-800 hover:text-indigo-600">
                              {labelOf(rowField, g.key)}
                            </button>
                          ) : (
                            <span className="text-slate-800">{labelOf(rowField, g.key)}</span>
                          )}
                        </td>
                        {cols.flatMap((c) =>
                          picked.map((m) => (
                            <td key={`${c}-${m.key}`} className="px-2 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
                              {fmt(m, g.cells.get(c))}
                            </td>
                          )),
                        )}
                        {picked.map((m) => (
                          <td key={m.key} className="px-2 py-1 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                            {fmt(m, g.total)}
                          </td>
                        ))}
                        {m0.additive && <td className="px-2 py-1 text-right tabular-nums text-slate-500">{share(g.total)}</td>}
                        {growth && <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{growthCell(g.key, 1)}</td>}
                        {showYoY && <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{growthCell(g.key, growth.year)}</td>}
                      </tr>
                      {g.subs.map((s) => (
                        <tr key={s.key} className="hover:bg-slate-50">
                          <td className="py-1 pl-6 pr-2 text-slate-600">{labelOf(row2, s.key)}</td>
                          {cols.flatMap((c) =>
                            picked.map((m) => (
                              <td key={`${c}-${m.key}`} className="px-2 py-1 text-right tabular-nums text-slate-600 whitespace-nowrap">
                                {fmt(m, s.cells.get(c))}
                              </td>
                            )),
                          )}
                          {picked.map((m) => (
                            <td key={m.key} className="px-2 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
                              {fmt(m, s.total)}
                            </td>
                          ))}
                          {m0.additive && <td className="px-2 py-1 text-right tabular-nums text-slate-400">{share(s.total)}</td>}
                          {growth && <td />}
                          {showYoY && <td />}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {pivot.rowList.length === 0 && (
                    <tr>
                      <td colSpan={2 + cols.length * picked.length + picked.length} className="px-3 py-8 text-center text-sm text-slate-500">
                        Nothing for this period and these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-50">
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                    <td className="px-2 py-1.5">Grand total</td>
                    {cols.flatMap((c) =>
                      picked.map((m) => (
                        <td key={`${c}-${m.key}`} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {fmt(m, pivot.colTotals.get(c))}
                        </td>
                      )),
                    )}
                    {picked.map((m) => (
                      <td key={m.key} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {fmt(m, pivot.grand)}
                      </td>
                    ))}
                    {m0.additive && <td className="px-2 py-1.5 text-right tabular-nums">100%</td>}
                    {growth && <td />}
                    {showYoY && <td />}
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

function Step({ n, label }: { n: string; label: string }) {
  return (
    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">{n}</span>
      {label}
    </span>
  );
}

// A filter field's value list: tick the values to keep.
function FilterPicker({
  all,
  label,
  include,
  onChange,
}: {
  all: string[];
  label: (k: string) => string;
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
  const list = q ? all.filter((v) => label(v).toLowerCase().includes(q.toLowerCase())) : all;
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
                  <span className="truncate">{label(v)}</span>
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
