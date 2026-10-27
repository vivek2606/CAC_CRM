"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChartStudio, type StudioView } from "@/components/chart-studio/studio";
import { dateKey, ratio, sum, type Dataset, type DatasetDef, type MeasureDef, type Rec } from "@/components/chart-studio/engine";
import { deleteStudioView, saveStudioView } from "../studio-actions";
import type { RegisterRow } from "./register-table";

// The Sales Register's chart studio: the lines the table is showing (its
// period, sales person, type, entity and column filters), with the monthly
// targets. Clicking a row filters the table. Views are saved to the login.

export type TargetRow = { salesPerson: string; month: string; value: number }; // month: YYYY-MM

const M = (key: string, label: string, short: string, value: MeasureDef["value"], o: Partial<MeasureDef> = {}): MeasureDef => ({ key, label, short, value, ...o });
const MEASURES: MeasureDef[] = [
  M("amount", "Sum of amount (excl. VAT)", "Amount", (a) => sum(a, "amount"), { money: true, additive: true }),
  M("qty", "Sum of qty", "Qty", (a) => sum(a, "qty"), { additive: true }),
  M("lines", "Count of lines", "Lines", (a) => a.n, { additive: true }),
  M("invoices", "Count of invoices", "Invoices", (a) => a.sets.inv?.size ?? 0),
  M("avgInvoice", "Average invoice value", "Avg invoice", (a) => ratio(sum(a, "amount"), a.sets.inv?.size ?? 0), { money: true }),
  M("avgRate", "Average rate (amount ÷ qty)", "Avg rate", (a) => ratio(sum(a, "amount"), sum(a, "qty")), { money: true }),
  M("target", "Monthly target", "Target", (a) => a.target, { money: true, target: true }),
  M("achPct", "Achievement % (amount ÷ target)", "Achieved %", (a) => ratio(sum(a, "amount"), a.target, 100), { pct: true, target: true }),
  M("toGo", "Balance to target (target - amount)", "Balance", (a) => a.target - sum(a, "amount"), { money: true, target: true }),
];
const MONTH = "invoiceDate:month";
const PRESETS: DatasetDef["presets"] = [
  { name: "Product mix - donut", cfg: { rows: ["category"], values: ["amount"], chart: "donut" } },
  { name: "Monthly sales by product type - stacked", cfg: { rows: [MONTH], col: "category", values: ["amount"], chart: "column" } },
  { name: "Monthly sales trend - line", cfg: { rows: [MONTH], values: ["amount"], chart: "line" } },
  { name: "Top 20 customers - bar", cfg: { rows: ["accountName"], values: ["amount"], chart: "bar", top: 20 } },
  { name: "Customers by size - treemap", cfg: { rows: ["accountName"], values: ["amount"], chart: "treemap", top: 30 } },
  { name: "Monthly target vs achievement", cfg: { rows: [MONTH], values: ["amount", "target", "achPct", "toGo"], chart: "target" } },
  { name: "Sales person target vs achievement", cfg: { rows: ["salesPerson"], values: ["amount", "target", "achPct", "toGo"], chart: "target", top: 0 } },
  { name: "Product type share by month - 100%", cfg: { rows: [MONTH], col: "category", values: ["amount"], chart: "percent" }, simple: false },
  { name: "Sales person by year - clustered", cfg: { rows: ["salesPerson"], col: "invoiceDate:year", values: ["amount"], chart: "clustered" }, simple: false },
  { name: "Product type x month - heatmap", cfg: { rows: ["category"], col: MONTH, values: ["amount"], chart: "heatmap" }, simple: false },
  { name: "Products: amount vs qty - scatter", cfg: { rows: ["product"], values: ["amount", "qty"], chart: "scatter", top: 50 }, simple: false },
  { name: "Sales person profile - radar", cfg: { rows: ["category"], col: "salesPerson", values: ["amount"], chart: "radar" }, simple: false },
  { name: "Entities - 3D columns", cfg: { rows: ["company"], values: ["amount"], chart: "column3d" }, simple: false },
];

function registerDataset(rows: RegisterRow[], showSalesPerson: boolean, targets: TargetRow[]): Dataset {
  const fields = [
    { key: "category", label: "Product type" },
    { key: "product", label: "Product" },
    { key: "productCode", label: "Product code" },
    { key: "accountName", label: "Account name" },
    { key: "accountCode", label: "Account code" },
    ...(showSalesPerson ? [{ key: "salesPerson", label: "Sales person" }] : []),
    { key: "company", label: "Entity" },
    { key: "invoiceNo", label: "Invoice no." },
    { key: "invoiceDate", label: "Invoice", date: true },
  ];
  return {
    key: "register",
    label: "Sales register",
    noun: "lines",
    fields,
    measures: MEASURES,
    sums: ["amount", "qty"],
    distinct: ["inv"],
    presets: PRESETS,
    targetDims: ["salesPerson", MONTH, "invoiceDate:quarter", "invoiceDate:year"],
    actualMeasure: "amount",
    defaultCfg: { rows: ["category"], values: ["amount"] },
    rows: rows.map(({ accountLinked: _linked, ...r }): Rec => ({ ...r, inv: r.invoiceNo ? `${r.company}|${r.invoiceNo}` : "" })), // eslint-disable-line @typescript-eslint/no-unused-vars
    targets: targets.map((t) => {
      const d = `${t.month}-01`;
      return { value: t.value, dims: { salesPerson: t.salesPerson, [MONTH]: t.month, "invoiceDate:quarter": dateKey(d, "quarter"), "invoiceDate:year": dateKey(d, "year") } };
    }),
  };
}

export function RegisterPivot({
  rows,
  showSalesPerson,
  onPick,
  side,
  targets = [],
  views: savedViews = [],
}: {
  rows: RegisterRow[];
  showSalesPerson: boolean;
  // A row clicked: the table column and the value to filter it to.
  onPick: (dim: string, key: string) => void;
  // The register's own filters (period, sales person, type, entity).
  side?: ReactNode;
  targets?: TargetRow[];
  views?: StudioView[];
}) {
  const ds = useMemo(() => registerDataset(rows, showSalesPerson, targets), [rows, showSalesPerson, targets]);
  const [views, setViews] = useState(savedViews);
  return (
    <ChartStudio
      datasets={[ds]}
      storageKey="cac-register-studio-v3"
      side={side}
      onPick={onPick}
      views={{
        list: views,
        save: async (name, cfg) => {
          const res = await saveStudioView("register", { name, cfg });
          if (res.error) window.alert(res.error);
          else if (res.views) setViews(res.views);
        },
        remove: async (id) => {
          const res = await deleteStudioView("register", id);
          if (res.views) setViews(res.views);
        },
      }}
    />
  );
}
