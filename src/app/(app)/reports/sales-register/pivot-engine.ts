import type { RegisterRow } from "./register-table";

// The pivot over Sales Register lines: fields to group by, values to total,
// filters, and the totals per row / sub-row / column cell.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PivotField =
  | "accountName"
  | "accountCode"
  | "salesPerson"
  | "productCode"
  | "product"
  | "category"
  | "company"
  | "invoiceNo"
  | "month"
  | "quarter"
  | "year";
export const FIELDS: { key: PivotField; label: string; time?: boolean }[] = [
  { key: "category", label: "Product type" },
  { key: "product", label: "Product" },
  { key: "productCode", label: "Product code" },
  { key: "accountName", label: "Account name" },
  { key: "accountCode", label: "Account code" },
  { key: "salesPerson", label: "Sales person" },
  { key: "company", label: "Entity" },
  { key: "invoiceNo", label: "Invoice no." },
  { key: "month", label: "Invoice month", time: true },
  { key: "quarter", label: "Invoice quarter", time: true },
  { key: "year", label: "Invoice year", time: true },
];

export type Measure = "amount" | "qty" | "lines" | "invoices" | "avgInvoice" | "avgRate";
export const MEASURES: { key: Measure; label: string; short: string; money?: boolean }[] = [
  { key: "amount", label: "Sum of amount (excl. VAT)", short: "Amount", money: true },
  { key: "qty", label: "Sum of qty", short: "Qty" },
  { key: "lines", label: "Count of lines", short: "Lines" },
  { key: "invoices", label: "Count of invoices", short: "Invoices" },
  { key: "avgInvoice", label: "Average invoice value", short: "Avg invoice", money: true },
  { key: "avgRate", label: "Average rate (amount ÷ qty)", short: "Avg rate", money: true },
];
export const measureInfo = (m: Measure) => MEASURES.find((x) => x.key === m)!;
export const fieldLabel = (f: PivotField | "" | null | undefined) => FIELDS.find((x) => x.key === f)?.label ?? "";
export const isTime = (f: PivotField | "" | null | undefined) => FIELDS.find((x) => x.key === f)?.time ?? false;

// The value a line has for a field ("2026-09" for its month - sortable).
export const keyOf = (r: RegisterRow, f: PivotField): string => {
  if (f === "month") return r.invoiceDate.slice(0, 7);
  if (f === "year") return r.invoiceDate.slice(0, 4);
  if (f === "quarter") return `${r.invoiceDate.slice(0, 4)}-Q${Math.floor((Number(r.invoiceDate.slice(5, 7)) - 1) / 3) + 1}`;
  return String(r[f] ?? "") || "(blank)";
};
export const labelOf = (f: PivotField | "" | null | undefined, k: string) =>
  f === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : f === "quarter" ? `${k.slice(5)} ${k.slice(0, 4)}` : k;

// Running totals for one cell; invoices are counted distinct, so cells are
// merged (never subtracted) to make totals and "Other".
export type Acc = { amount: number; qty: number; lines: number; inv: Set<string> };
export const acc = (): Acc => ({ amount: 0, qty: 0, lines: 0, inv: new Set() });
export const addLine = (a: Acc, r: RegisterRow) => {
  a.amount += r.amount;
  a.qty += r.qty;
  a.lines += 1;
  if (r.invoiceNo) a.inv.add(`${r.company}|${r.invoiceNo}`);
};
export const merge = (into: Acc, a: Acc | undefined) => {
  if (!a) return into;
  into.amount += a.amount;
  into.qty += a.qty;
  into.lines += a.lines;
  for (const i of a.inv) into.inv.add(i);
  return into;
};
export const valueOf = (a: Acc | undefined, m: Measure): number => {
  if (!a) return 0;
  switch (m) {
    case "amount":
      return a.amount;
    case "qty":
      return a.qty;
    case "lines":
      return a.lines;
    case "invoices":
      return a.inv.size;
    case "avgInvoice":
      return a.inv.size ? a.amount / a.inv.size : 0;
    case "avgRate":
      return a.qty ? a.amount / a.qty : 0;
  }
};

export type PivotFilter = { field: PivotField; include: string[] | null }; // null = all
export type SortMode = "value-desc" | "value-asc" | "label";
export type PivotSpec = { rows: PivotField[]; col: PivotField | null; values: Measure[]; filters: PivotFilter[]; sort: SortMode };

export const applyFilters = (rows: RegisterRow[], filters: PivotFilter[]) => {
  const active = filters.filter((f) => f.include);
  if (!active.length) return rows;
  const sets = active.map((f) => ({ field: f.field, set: new Set(f.include!) }));
  return rows.filter((r) => sets.every((f) => f.set.has(keyOf(r, f.field))));
};

export type PivotGroup = { key: string; total: Acc; cells: Map<string, Acc> };
export type PivotRow = PivotGroup & { subs: PivotGroup[] };
export type Pivot = { rowList: PivotRow[]; colList: string[]; colTotals: Map<string, Acc>; grand: Acc };

export function buildPivot(lines: RegisterRow[], spec: PivotSpec): Pivot {
  const [row, row2] = spec.rows;
  const { col } = spec;
  const m = spec.values[0] ?? "amount";
  const byRow = new Map<string, { total: Acc; cells: Map<string, Acc>; subs: Map<string, { total: Acc; cells: Map<string, Acc> }> }>();
  const colTotals = new Map<string, Acc>();
  const grand = acc();
  const cell = (map: Map<string, Acc>, k: string) => {
    let a = map.get(k);
    if (!a) map.set(k, (a = acc()));
    return a;
  };
  for (const r of lines) {
    const rk = row ? keyOf(r, row) : "All";
    const ck = col ? keyOf(r, col) : "";
    let g = byRow.get(rk);
    if (!g) byRow.set(rk, (g = { total: acc(), cells: new Map(), subs: new Map() }));
    addLine(g.total, r);
    if (col) {
      addLine(cell(g.cells, ck), r);
      addLine(cell(colTotals, ck), r);
    }
    if (row2) {
      const sk = keyOf(r, row2);
      let s = g.subs.get(sk);
      if (!s) g.subs.set(sk, (s = { total: acc(), cells: new Map() }));
      addLine(s.total, r);
      if (col) addLine(cell(s.cells, ck), r);
    }
    addLine(grand, r);
  }
  // Time fields in date order; others by the first value (or A-Z).
  const order = <T>(entries: [string, T][], f: PivotField | null | undefined, total: (t: T) => number) => {
    if (isTime(f) || spec.sort === "label") return entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    const dir = spec.sort === "value-asc" ? 1 : -1;
    return entries.sort((a, b) => (total(a[1]) - total(b[1])) * dir || a[0].localeCompare(b[0]));
  };
  const rowList = order([...byRow.entries()], row, (g) => valueOf(g.total, m)).map(([key, g]) => ({
    key,
    total: g.total,
    cells: g.cells,
    subs: order([...g.subs.entries()], row2, (s) => valueOf(s.total, m)).map(([sk, s]) => ({ key: sk, ...s })),
  }));
  // Columns largest first (by total) unless time / A-Z.
  const colList =
    isTime(col) || spec.sort === "label"
      ? [...colTotals.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [...colTotals.entries()].sort((a, b) => valueOf(b[1], m) - valueOf(a[1], m)).map(([k]) => k);
  return { rowList, colList, colTotals, grand };
}

// The distinct values of a field over the lines, for a filter list.
export const distinctValues = (lines: RegisterRow[], f: PivotField) =>
  [...new Set(lines.map((r) => keyOf(r, f)))].sort((a, b) => (isTime(f) ? a.localeCompare(b) : a.localeCompare(b, undefined, { numeric: true })));
