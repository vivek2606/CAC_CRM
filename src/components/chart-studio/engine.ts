// The chart studio's pivot over any list of records: a dataset says which
// fields can group the records (date fields give month / quarter / year),
// what to add up, and the values (measures) worked out from those totals.

export type Rec = Record<string, string | number | null | undefined>;
// order: the field's natural order (e.g. pipeline stages), used instead of
// sorting by value.
export type FieldDef = { key: string; label: string; date?: boolean; order?: string[] };

// Running totals for one cell. Cells are merged (never subtracted), so
// distinct counts and averages stay right for totals and "Other".
export type Acc = { n: number; sums: Record<string, number>; sets: Record<string, Set<string>>; target: number };

export type MeasureDef = {
  key: string;
  label: string;
  short: string;
  money?: boolean;
  pct?: boolean;
  // Adds up across rows - the table shows each row's share of the total.
  additive?: boolean;
  // Needs the targets (see Dataset.targets).
  target?: boolean;
  value: (a: Acc) => number;
};

export type Preset = { name: string; cfg: Partial<StudioConfig>; simple?: boolean };

export type DatasetDef = {
  key: string;
  label: string;
  noun: string; // "lines", "deals"…
  fields: FieldDef[];
  measures: MeasureDef[];
  sums: string[]; // numeric record keys to add up
  distinct?: string[]; // record keys to count distinct
  presets: Preset[];
  // Targets are set per these dims (e.g. sales person, month); the
  // "Target vs achieved" chart compares them with actualMeasure.
  targetDims?: string[];
  actualMeasure?: string;
  defaultCfg?: Partial<StudioConfig>;
  // The date field the period filter uses by default (datasets loaded whole).
  periodField?: string;
};
export type TargetRec = { dims: Record<string, string>; value: number };
export type Dataset = DatasetDef & { rows: Rec[]; targets?: TargetRec[] };

export type ChartType =
  | "bar"
  | "column"
  | "clustered"
  | "percent"
  | "column3d"
  | "line"
  | "area"
  | "donut"
  | "pie"
  | "treemap"
  | "funnel"
  | "radar"
  | "heatmap"
  | "scatter"
  | "target"
  | "table";
export type SortMode = "value-desc" | "value-asc" | "label";
export type PivotFilter = { field: string; include: string[] | null }; // null = all
export type PeriodPreset = "all" | "thisMonth" | "lastMonth" | "last3m" | "last6m" | "last12m" | "thisYear" | "lastYear" | "custom";
export type Period = { field: string; preset: PeriodPreset; from?: string; to?: string };
export type StudioConfig = {
  dataset: string;
  rows: string[];
  col: string | null;
  values: string[];
  filters: PivotFilter[];
  chart: ChartType;
  top: number;
  labels: boolean;
  sort: SortMode;
  size: "s" | "m" | "l";
  mode: "simple" | "advanced";
  period?: Period;
};

// ---- Dimensions -----------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Grain = "month" | "quarter" | "year";
const GRAINS: Grain[] = ["month", "quarter", "year"];
export type Dim = { key: string; label: string; grain?: Grain };

// A date field "createdAt" gives "createdAt:month" / ":quarter" / ":year".
export function dimsOf(ds: DatasetDef): Dim[] {
  return ds.fields.flatMap((f) => (f.date ? GRAINS.map((g) => ({ key: `${f.key}:${g}`, label: `${f.label} ${g}`, grain: g })) : [{ key: f.key, label: f.label }]));
}
const grainOf = (dim: string | null | undefined): Grain | undefined => (dim?.includes(":") ? (dim.split(":")[1] as Grain) : undefined);
export const isTime = (dim: string | null | undefined) => !!grainOf(dim);

export function dateKey(iso: string, g: Grain): string {
  if (g === "month") return iso.slice(0, 7);
  if (g === "year") return iso.slice(0, 4);
  return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}
export function keyOf(r: Rec, dim: string): string {
  const g = grainOf(dim);
  if (g) {
    const v = r[dim.split(":")[0]];
    return typeof v === "string" && v.length >= 7 ? dateKey(v, g) : "(no date)";
  }
  const v = r[dim];
  return v == null || v === "" ? "(blank)" : String(v);
}
export function labelOf(dim: string | null | undefined, k: string): string {
  const g = grainOf(dim);
  if (!g || k.startsWith("(")) return k;
  if (g === "month") return `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  if (g === "quarter") return `${k.slice(5)} ${k.slice(0, 4)}`;
  return k;
}

// ---- Totals ---------------------------------------------------------------

export const acc = (): Acc => ({ n: 0, sums: {}, sets: {}, target: 0 });
export function addRec(a: Acc, r: Rec, ds: DatasetDef) {
  a.n += 1;
  for (const f of ds.sums) {
    const v = r[f];
    if (typeof v === "number" && Number.isFinite(v)) a.sums[f] = (a.sums[f] ?? 0) + v;
  }
  for (const f of ds.distinct ?? []) {
    const v = r[f];
    if (v != null && v !== "") (a.sets[f] ??= new Set()).add(String(v));
  }
}
export function merge(into: Acc, a: Acc | undefined): Acc {
  if (!a) return into;
  into.n += a.n;
  into.target += a.target;
  for (const [k, v] of Object.entries(a.sums)) into.sums[k] = (into.sums[k] ?? 0) + v;
  for (const [k, s] of Object.entries(a.sets)) for (const x of s) (into.sets[k] ??= new Set()).add(x);
  return into;
}
export const sum = (a: Acc, f: string) => a.sums[f] ?? 0;
export const ratio = (n: number, d: number, scale = 1) => (d ? (n / d) * scale : 0);

// ---- Filters --------------------------------------------------------------

export function applyFilters(rows: Rec[], filters: PivotFilter[]): Rec[] {
  const active = filters.filter((f) => f.include);
  if (!active.length) return rows;
  const sets = active.map((f) => ({ field: f.field, set: new Set(f.include!) }));
  return rows.filter((r) => sets.every((f) => f.set.has(keyOf(r, f.field))));
}
export function filterTargets(targets: TargetRec[], filters: PivotFilter[], targetDims: string[]): TargetRec[] {
  const active = filters.filter((f) => f.include && targetDims.includes(f.field));
  if (!active.length) return targets;
  return targets.filter((t) => active.every((f) => f.include!.includes(t.dims[f.field] ?? "")));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
// The from / to dates (inclusive, YYYY-MM-DD) of a period, or null for all.
export function periodRange(p: Period | undefined, now = new Date()): { from: string; to: string } | null {
  if (!p || p.preset === "all") return null;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = iso(new Date(Date.UTC(y, m, now.getUTCDate())));
  const first = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm, 1)));
  const last = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm + 1, 0)));
  switch (p.preset) {
    case "thisMonth":
      return { from: first(y, m), to: today };
    case "lastMonth":
      return { from: first(y, m - 1), to: last(y, m - 1) };
    case "last3m":
      return { from: first(y, m - 2), to: today };
    case "last6m":
      return { from: first(y, m - 5), to: today };
    case "last12m":
      return { from: first(y, m - 11), to: today };
    case "thisYear":
      return { from: first(y, 0), to: today };
    case "lastYear":
      return { from: first(y - 1, 0), to: last(y - 1, 11) };
    case "custom":
      return p.from || p.to ? { from: p.from || "0000-01-01", to: p.to || "9999-12-31" } : null;
  }
}
export function applyPeriod(rows: Rec[], p: Period | undefined): Rec[] {
  const r = periodRange(p);
  if (!r || !p) return rows;
  return rows.filter((x) => {
    const v = x[p.field];
    return typeof v === "string" && v.slice(0, 10) >= r.from && v.slice(0, 10) <= r.to;
  });
}
// Targets for whole months the period touches (targets are monthly).
export function targetsInPeriod(targets: TargetRec[], p: Period | undefined, monthDim: string | undefined): TargetRec[] {
  const r = periodRange(p);
  if (!r || !monthDim) return targets;
  return targets.filter((t) => {
    const m = t.dims[monthDim];
    return !m || (m >= r.from.slice(0, 7) && m <= r.to.slice(0, 7));
  });
}

// ---- Pivot ----------------------------------------------------------------

export type PivotGroup = { key: string; total: Acc; cells: Map<string, Acc> };
export type PivotRow = PivotGroup & { subs: PivotGroup[] };
// targetOk: targets were added (false when a Rows / Columns field can't
// carry them, e.g. targets aren't set per product).
export type Pivot = { rowList: PivotRow[]; colList: string[]; colTotals: Map<string, Acc>; grand: Acc; targetOk: boolean };
export type PivotSpec = { rows: string[]; col: string | null; values: string[]; sort: SortMode };

export function buildPivot(recs: Rec[], spec: PivotSpec, ds: DatasetDef, targets: TargetRec[] = []): Pivot {
  const [row, row2] = spec.rows;
  const { col } = spec;
  const m = ds.measures.find((x) => x.key === spec.values[0]) ?? ds.measures[0];
  const v = (a: Acc) => m.value(a);
  const byRow = new Map<string, { total: Acc; cells: Map<string, Acc>; subs: Map<string, { total: Acc; cells: Map<string, Acc> }> }>();
  const colTotals = new Map<string, Acc>();
  const grand = acc();
  const cell = (map: Map<string, Acc>, k: string) => {
    let a = map.get(k);
    if (!a) map.set(k, (a = acc()));
    return a;
  };
  // Every total a record (or a target) with these keys adds to.
  const accsFor = (rk: string, sk: string | null, ck: string): Acc[] => {
    let g = byRow.get(rk);
    if (!g) byRow.set(rk, (g = { total: acc(), cells: new Map(), subs: new Map() }));
    const out = [g.total, grand];
    if (col) out.push(cell(g.cells, ck), cell(colTotals, ck));
    if (row2 && sk != null) {
      let s = g.subs.get(sk);
      if (!s) g.subs.set(sk, (s = { total: acc(), cells: new Map() }));
      out.push(s.total);
      if (col) out.push(cell(s.cells, ck));
    }
    return out;
  };
  for (const r of recs) for (const a of accsFor(row ? keyOf(r, row) : "All", row2 ? keyOf(r, row2) : null, col ? keyOf(r, col) : "")) addRec(a, r, ds);
  const targetDims = ds.targetDims ?? [];
  const targetOk = targetDims.length > 0 && [row, row2, col].every((f) => !f || targetDims.includes(f));
  if (targetOk) {
    for (const t of targets) {
      if (!t.value) continue;
      for (const a of accsFor(row ? (t.dims[row] ?? "(blank)") : "All", row2 ? (t.dims[row2] ?? "(blank)") : null, col ? (t.dims[col] ?? "(blank)") : "")) a.target += t.value;
    }
  }
  const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const natural = (f: string | null | undefined) => ds.fields.find((x) => x.key === f)?.order;
  const byNatural = (o: string[]) => (a: string, b: string) => {
    const i = o.indexOf(a);
    const j = o.indexOf(b);
    return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || byLabel(a, b);
  };
  const order = <T>(entries: [string, T][], f: string | null | undefined, total: (t: T) => number) => {
    const o = natural(f);
    if (o) return entries.sort((a, b) => byNatural(o)(a[0], b[0]));
    if (isTime(f) || spec.sort === "label") return entries.sort((a, b) => byLabel(a[0], b[0]));
    const dir = spec.sort === "value-asc" ? 1 : -1;
    return entries.sort((a, b) => (total(a[1]) - total(b[1])) * dir || byLabel(a[0], b[0]));
  };
  const rowList = order([...byRow.entries()], row, (g) => v(g.total)).map(([key, g]) => ({
    key,
    total: g.total,
    cells: g.cells,
    subs: order([...g.subs.entries()], row2, (s) => v(s.total)).map(([sk, s]) => ({ key: sk, ...s })),
  }));
  const colOrder = natural(col);
  const colList = colOrder
    ? [...colTotals.keys()].sort(byNatural(colOrder))
    : isTime(col) || spec.sort === "label"
      ? [...colTotals.keys()].sort(byLabel)
      : [...colTotals.entries()].sort((a, b) => v(b[1]) - v(a[1])).map(([k]) => k);
  return { rowList, colList, colTotals, grand, targetOk };
}

export const distinctValues = (recs: Rec[], dim: string) => [...new Set(recs.map((r) => keyOf(r, dim)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

// A saved layout made for another version of the dataset: keep only what
// still exists.
export function sanitize(cfg: Partial<StudioConfig>, ds: DatasetDef, fallback: StudioConfig): StudioConfig {
  const dims = new Set(dimsOf(ds).map((d) => d.key));
  const measures = new Set(ds.measures.map((m) => m.key));
  const c = { ...fallback, ...cfg, dataset: ds.key };
  c.rows = (c.rows ?? []).filter((r) => dims.has(r)).slice(0, 2);
  if (!c.rows.length) c.rows = fallback.rows;
  c.col = c.col && dims.has(c.col) && !c.rows.includes(c.col) ? c.col : null;
  c.values = (c.values ?? []).filter((v) => measures.has(v)).slice(0, 4);
  if (!c.values.length) c.values = fallback.values;
  c.filters = (c.filters ?? []).filter((f) => dims.has(f.field));
  if (c.period && !ds.fields.some((f) => f.date && f.key === c.period!.field)) c.period = fallback.period;
  return c;
}
